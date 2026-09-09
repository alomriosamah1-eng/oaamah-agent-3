// The conversation loop — the desktop assistant's `floating_assistant.py`
// flow, re-implemented for the phone and EMBEDDED with the Osamah agent.
//
// Loop:
//     press orb → listen (VAD, auto-ends on silence) → send what was said to
//     the agent → the dedicated VOICE agent replies FAST (flash chain, short
//     reply) → the WHOLE reply is synthesized as ONE continuous audio and
//     played without gaps → short echo mute → listen again.
//
// The reply is spoken ONCE, whole: deltas only update the live transcript,
// nothing is spoken until the reply completes, then the entire text becomes a
// single MP3 with zero inter-sentence pauses — the reply arrives and SOUNDS
// like a real person. (Short replies are guaranteed by the voice agent, so the
// one file is also short in practice.)
//
// The floor is ALWAYS yours, and the reply is never cut off by accident:
//   • thinking/speaking → the mic is closed. The agent says its piece
//     uninterrupted. If YOU want to take the floor mid-reply, tap the orb —
//     the audio cuts instantly and the mic re-opens so you can talk.
//   • after a reply it re-arms by itself (continuous), so a follow-up is
//     accepted without touching anything — like the desktop.
//
// Two different aborts exist on purpose:
//   • `stop()` — a full, deliberate shutdown (epoch bumped, everything
//     cancelled). This is the orb's OFF switch when the floor is idle/open.
//   • `interrupt()` — a gentle "cut in": aborts the in-flight reply/speech
//     but keeps the loop alive and re-opens the mic at once.
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
    /**
     * Optional character persona («ميرا»/«كريم») seeded into the model's
     * prompt so the reply's CONTENT matches the chosen voice.
     */
    personaHint?: string;
    onDelta: (delta: string) => void;
  },
) => Promise<{ reply: string; sessionId: string }>;

export type ConversationEvent =
  | { type: 'phase'; phase: VoicePhase }
  | { type: 'partial'; text: string }
  | { type: 'diag'; text: string }
  | { type: 'turn'; role: 'user' | 'agent'; text: string }
  | { type: 'error'; message: string }
  /** Live mic level 0–1, for the orb. */
  | { type: 'volume'; level: number };

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
  /**
   * Synthesize the WHOLE reply into local audio file(s) — NO playback. Returns
   * the uris (normally ONE — the reply is spoken as a single continuous file)
   * or null to signal the platform-TTS fallback is needed. The dedicated voice
   * agent keeps replies short, so this stays one file in practice; the rare
   * over-the-cap safety splitter yields consecutive uris with no pause.
   */
  synthesize: (
    text: string,
    signal?: AbortSignal,
    config?: VoiceConfig,
  ) => Promise<{ uris: string[] } | null>;
  /** Play a synthesized file to completion (interruptible by abort). */
  play: (uri: string, signal?: AbortSignal) => Promise<void>;
  /** Speak a beat with the platform TTS when no remote audio is available. */
  speakNative: (
    text: string,
    signal?: AbortSignal,
    config?: VoiceConfig,
  ) => Promise<void>;
  /** Instantly cut whatever is being spoken (tap-to-interrupt). */
  stopSpeech: () => void;
  /** Emit lifecycle events to the UI layer. */
  onEvent: (event: ConversationEvent) => void;
  /** The user's chosen model id when one is stored. */
  getModel: () => Promise<string | undefined>;
}

/** How fast the mic re-opens after the user taps to cut in (ms). */
const REARM_AFTER_INTERRUPT_MS = 260;

export class Conversation {
  private opts: ConversationOptions;
  private epoch = 0;
  private phase: VoicePhase = 'idle';
  private sessionId: string | undefined;
  private listening = false;
  private sttEpoch = 0;
  private turnAbort: AbortController | null = null;
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null;

  // Speech state (per turn): the WHOLE reply is spoken once — awaited directly
  // from the turn — with no beat pipeline in between.
  // Wall-clock of the moment the user stopped speaking — for a latency log.
  private turnStartMs = 0;
  // Voice snapshot for the CURRENT reply, frozen on its first spoken beat so a
  // reply is always spoken by ONE voice — never a gender/dialect change mid-air.
  private turnConfig: VoiceConfig | undefined;

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
    this.turnAbort?.abort();
    this.turnAbort = null;
    try {
      void this.opts.recorder.cancel();
    } catch {}
    this.opts.stopSpeech();
    if (this.phase !== 'idle') this.setPhase('idle');
    voiceLog('VOICE_CANCELLED', 'conversation-stop');
  }

  /**
   * Cut the floor open: abort the in-flight reply and speech instantly, keep
   * the loop alive, and re-arm the mic so the user can talk right back.
   */
  interrupt(): void {
    if (this.phase === 'idle' || this.phase === 'listening') return;
    const c = this.turnAbort;
    if (c && !c.signal.aborted) c.abort();
    this.opts.stopSpeech();
    this.setPhase('idle');
    const epoch = this.epoch;
    if (this.cooldownTimer) clearTimeout(this.cooldownTimer);
    this.cooldownTimer = setTimeout(() => {
      this.cooldownTimer = null;
      if (this.isStale(epoch)) return;
      this.startListening();
    }, REARM_AFTER_INTERRUPT_MS);
  }

  /**
   * Speak a one-shot line (the agent's opening greeting) through the SAME
   * pipeline as a real reply — frozen voice, segments, echo cooldown, auto
   * re-arm — so an app-open sounds the agent without the user saying a word.
   * A tap during the greeting interrupts it and opens the mic, exactly like
   * a reply. No-op while anything else is already on.
   */
  greet(text: string): void {
    if (!text || this.phase !== 'idle' || this.listening) return;
    const epoch = this.epoch;
    void this.runGreetingTurn(text, epoch);
  }

  private async runGreetingTurn(text: string, epoch: number): Promise<void> {
    if (this.isStale(epoch)) return;
    this.turnConfig = this.opts.config();
    await this.speakReply(text, epoch);
    if (this.isStale(epoch)) return;
    this.turnConfig = undefined;
    this.setPhase('idle');
    this.relisten(epoch);
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
      onVolume: (level) => this.opts.onEvent({ type: 'volume', level }),
    });
  }

  /* ------------------------------ the turn ------------------------------- */

  private async finalize(text: string, epoch: number): Promise<void> {
    const clean = text.trim();
    if (!clean) {
      // Noise blip — nothing was spoken, so there is no echo to wait out.
      // Keep listening immediately (desktop discards it the same way).
      if (this.isStale(epoch)) return;
      this.startListening();
      return;
    }

    this.opts.onEvent({ type: 'turn', role: 'user', text: clean });
    this.turnStartMs = Date.now();
    this.setPhase('thinking');
    await this.runAgentTurn(clean, epoch);
  }

  /**
   * Speak the WHOLE reply as ONE continuous audio — no sentence splitting, no
   * gaps, no beat pipeline. Deltas already rendered the live transcript, so
   * synthesis starts the instant the reply is complete and the single file
   * plays back-to-end. (The rare over-the-cap safety splitter returns a few
   * uris that still play consecutively with no artificial pause.) When remote
   * synthesis produced nothing, the platform TTS carries the whole reply in a
   * single utterance so the answer is never silent.
   */
  private speakReply(text: string, epoch: number): Promise<void> {
    const t = text.trim();
    if (!t) return Promise.resolve();
    const startedAt = Date.now();
    // Freeze the voice on the CURRENT reply so it never changes mid-air.
    if (this.turnConfig === undefined) this.turnConfig = this.opts.config();
    if (this.phase !== 'speaking') this.setPhase('speaking');
    const active = () =>
      !this.isStale(epoch) && this.phase === 'speaking' && !this.turnAbort?.signal.aborted;

    const run = async () => {
      const fromUtterance = this.turnStartMs > 0 ? Date.now() - this.turnStartMs : startedAt;
      voiceLog('VOICE_REPLY_LATENCY', `utterance→reply ${fromUtterance}ms`);
      const uris = (
        await this.opts.synthesize(t, this.turnAbort?.signal, this.turnConfig)
      )?.uris;
      let remotePlayed = false;
      if (uris && uris.length && active()) {
        remotePlayed = true;
        for (const uri of uris) {
          if (!active()) break;
          try {
            await this.opts.play(uri, this.turnAbort?.signal);
          } catch {
            // A bad cache URI or native player failure must not make the voice
            // turn silent. Preserve interruption semantics, but fall back to
            // the device TTS for ordinary playback failures.
            remotePlayed = false;
            break;
          }
        }
      }
      if (!remotePlayed && active()) {
        await this.opts.speakNative(t, this.turnAbort?.signal, this.turnConfig);
      }
    };

    const p = run();
    return p;
  }

  private async runAgentTurn(command: string, epoch: number): Promise<void> {
    const model = await this.opts.getModel().catch(() => undefined);
    if (this.isStale(epoch)) return;

    const controller = new AbortController();
    this.turnAbort = controller;
    this.turnConfig = undefined;

    try {
      const { reply, sessionId } = await this.opts.agent(command, {
        sessionId: this.sessionId,
        model,
        signal: controller.signal,
        onDelta: (delta) => {
          if (this.isStale(epoch) || this.turnAbort !== controller) return;
          // Deltas drive the live transcript only — the reply is spoken later,
          // whole, as ONE continuous audio.
          this.opts.onEvent({ type: 'partial', text: delta });
        },
      });
      if (this.isStale(epoch)) return;

      this.sessionId = sessionId;
      this.opts.onEvent({ type: 'partial', text: '' });
      this.opts.onEvent({ type: 'turn', role: 'agent', text: reply });

      // Speak the finished reply as one continuous audio, then wait for it.
      await this.speakReply(reply, epoch);
      if (this.isStale(epoch)) return;
      // The reply is done — the orb shows an open floor while the echo
      // cooldown runs, not a speaker that is still "talking".
      this.setPhase('idle');
      this.relisten(epoch);
    } catch (err) {
      if (this.isStale(epoch)) return;
      if (controller.signal.aborted) {
        // Either a tap-interrupt (which already re-opened the mic) or a full
        // stop — nothing to do; the loop stays consistent either way.
        return;
      }
      this.diag('agent-error');
      voiceLog('VOICE_ERROR', 'agent-stream');
      this.opts.onEvent({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      this.setPhase('idle');
    } finally {
      controller.abort();
      this.turnConfig = undefined;
      if (this.turnAbort === controller) this.turnAbort = null;
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
      this.startListening();
    }, delay);
  }
}
