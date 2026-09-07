// The conversation loop — the desktop assistant's `floating_assistant.py`
// flow, re-implemented for the phone and EMBEDDED with the Osamah agent.
//
// Loop:
//     press orb → listen (VAD, auto-ends on silence) → send what was said to
//     the OpenCode agent → speak the reply (edge-tts) → 1.5s echo cooldown
//     → listen again. Pressing the orb again stops the whole loop.
//
// Everything is epoch-cancelled: every `stop()` bumps the epoch and any
// in-flight await that notices simply stops working — no late-callback races.

import type { VoiceConfig } from './config';
import type { Recognizer } from './recognition';
import { voiceLog } from './log';

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export type AgentStreamFn = (
  text: string,
  opts: {
    sessionId?: string;
    model?: string;
    signal?: AbortSignal;
    onDelta: (delta: string) => void;
  },
) => Promise<{ reply: string; sessionId: string }>;

export type ConversationEvent =
  | { type: 'phase'; phase: VoicePhase }
  | { type: 'partial'; text: string }
  | { type: 'diag'; text: string }
  | { type: 'turn'; role: 'user' | 'agent'; text: string }
  | { type: 'error'; message: string };

export interface ConversationOptions {
  /** Live config accessor — read fresh per use, like the desktop reads its constants. */
  config: () => VoiceConfig;
  /** Keep the loop running: auto re-arm the mic after each reply. */
  continuous: () => boolean;
  /** Mic mute after speaking so the speaker doesn't echo (desktop: 1.5s). */
  echoCooldownMs?: number;
  /** The microphone (recognition side). */
  recorder: Recognizer;
  /** The agent brain — OpenCode. */
  agent: AgentStreamFn;
  /** Spoken output (edge-tts → native fallback). */
  speak: (text: string, signal?: AbortSignal) => Promise<void>;
  /** Emit lifecycle events to the UI layer. */
  onEvent: (event: ConversationEvent) => void;
  /** The user's chosen model id when one is stored. */
  getModel: () => Promise<string | undefined>;
}

export class Conversation {
  private opts: ConversationOptions;
  private epoch = 0;
  private phase: VoicePhase = 'idle';
  private sessionId: string | undefined;
  private listening = false;
  private sttEpoch = 0;
  private stopHooks = new Set<() => void>();
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ConversationOptions) {
    this.opts = options;
  }

  getPhase(): VoicePhase {
    return this.phase;
  }

  private setPhase(phase: VoicePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.opts.onEvent({ type: 'phase', phase });
  }

  private diag(text: string): void {
    this.opts.onEvent({ type: 'diag', text });
  }

  private isStale(epoch: number): boolean {
    return this.epoch !== epoch;
  }

  /** Full stop: cancel mic, agent, speech and any pending cooldown. */
  stop(): void {
    this.epoch += 1;
    this.sttEpoch += 1;
    this.listening = false;
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    for (const hook of this.stopHooks) {
      try {
        hook();
      } catch {}
    }
    this.stopHooks.clear();
    try {
      void this.opts.recorder.cancel();
    } catch {}
    if (this.phase !== 'idle') this.setPhase('idle');
    voiceLog('VOICE_CANCELLED', 'conversation-stop');
  }

  /* ------------------------------ listening ------------------------------ */

  /** Begin (or resume) the loop: open the mic under the VAD. */
  startListening(): void {
    if (this.listening || this.phase === 'speaking' || this.phase === 'thinking') return;

    const epoch = this.epoch;
    const sttEpoch = ++this.sttEpoch;
    const { recorder, config } = this.opts;

    this.listening = true;
    this.setPhase('listening');

    void recorder.start(config().locale, {
      onFinal: (text) => {
        if (this.sttEpoch !== sttEpoch || this.isStale(epoch)) return;
        this.listening = false;
        void this.finalize(text, epoch);
      },
      onError: (err) => {
        if (this.sttEpoch !== sttEpoch || this.isStale(epoch)) return;
        this.listening = false;
        this.setPhase('idle');
        this.opts.onEvent({ type: 'error', message: err.message });
      },
      onVolume: () => {},
    });
  }

  /* ------------------------------ the turn ------------------------------- */

  private async finalize(text: string, epoch: number): Promise<void> {
    const clean = text.trim();
    if (!clean) {
      // Noise blip — keep listening (desktop discards it the same way).
      if (this.isStale(epoch)) return;
      this.relisten(epoch);
      return;
    }

    this.opts.onEvent({ type: 'turn', role: 'user', text: clean });
    this.setPhase('thinking');
    await this.runAgentTurn(clean, epoch);
  }

  private async runAgentTurn(command: string, epoch: number): Promise<void> {
    const model = await this.opts.getModel().catch(() => undefined);
    if (this.isStale(epoch)) return;

    const controller = new AbortController();
    const abort = () => controller.abort();
    this.stopHooks.add(abort);

    try {
      const { reply, sessionId } = await this.opts.agent(command, {
        sessionId: this.sessionId,
        model,
        signal: controller.signal,
        onDelta: (delta) => {
          if (this.isStale(epoch)) return;
          this.opts.onEvent({ type: 'partial', text: delta });
        },
      });
      if (this.isStale(epoch)) return;
      this.sessionId = sessionId;
      this.opts.onEvent({ type: 'partial', text: '' });
      this.opts.onEvent({ type: 'turn', role: 'agent', text: reply });

      // Desktop: speak the whole reply, then mute the mic for the echo
      // cooldown before listening again.
      if (reply.trim()) {
        this.setPhase('speaking');
        await this.opts.speak(reply, controller.signal);
      }
      if (this.isStale(epoch)) return;
      this.relisten(epoch);
    } catch (err) {
      if (this.isStale(epoch)) return;
      this.diag('agent-error');
      voiceLog('VOICE_ERROR', 'agent-stream');
      this.opts.onEvent({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      this.setPhase('idle');
    } finally {
      this.stopHooks.delete(abort);
      controller.abort();
    }
  }

  /** Re-arm the mic after the echo cooldown (desktop: 1.5s mute). */
  private relisten(epoch: number): void {
    if (this.isStale(epoch)) return;
    if (!this.opts.continuous()) {
      this.setPhase('idle');
      return;
    }
    const delay = this.opts.echoCooldownMs ?? 1500;
    this.cooldownTimer = setTimeout(() => {
      this.cooldownTimer = null;
      if (this.isStale(epoch)) return;
      this.setPhase('idle');
      this.startListening();
    }, delay);
  }
}