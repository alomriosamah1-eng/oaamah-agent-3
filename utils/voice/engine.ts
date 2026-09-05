// VoiceEngine — the conversation state machine.
//
// It owns the exact things the old panel mixed together: listening (STT),
// the reply stream from the agent, sentence buffering, chunked TTS via the
// provider router, and playback. The panel and orb become pure observers.
//
// Design notes
//   - Zero UI: no React, no expo-audio/expo-speech imports. Audio comes in
//     through the injected `AudioOutput`, so this file runs unchanged in a
//     Node test harness.
//   - Cancellation is epoch-based: every `stop()` bumps `epoch`; any in-flight
//     await that notices the epoch moved simply stops working. This kills the
//     old race where a late STT callback fired after the user stopped.
//   - Chunked overlap (old panel's latency win) is preserved: each chunk's
//     TTS synthesis starts the moment the sentence boundary arrives, while
//     playback stays serialized so chunks never overlap audibly.

import type { VoiceConfig } from './config';
import type { SttProvider } from './stt';
import type { TtsProviderRouter, TtsResult } from './providers/types';
import { splitChunks } from './text';
import { voiceLog } from './log';

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface AudioOutput {
  /**
   * Play a URI to completion. Resolves when the audio finishes (or the caller
   * is cancelled). Concrete player code lives in the UI/hook layer.
   */
  play(uri: string): Promise<void>;
  setVolume(volume: number): void;
  /** Stop whatever is playing and resolve any pending play(). */
  stop(): void;
}

export type AgentStreamFn = (
  text: string,
  opts: {
    sessionId?: string;
    model?: string;
    signal?: AbortSignal;
    onDelta?: (delta: string) => void;
    onSentence?: (sentence: string, full: string) => void;
  },
) => Promise<{ reply: string; sessionId: string }>;

export type VoiceEngineEvent =
  | { type: 'phase'; phase: VoicePhase }
  | { type: 'partial'; text: string }
  | { type: 'diag'; text: string }
  | { type: 'turn'; role: 'user' | 'agent'; text: string }
  | { type: 'error'; message: string }
  | { type: 'stt-volume'; level: number };

export interface VoiceEngineOptions {
  /** Live config accessor — the engine reads it fresh per request. */
  config: () => VoiceConfig;
  /** Continuous mode (auto-restart listening after a turn) is polled per turn. */
  continuous: () => boolean;
  providers: { stt: SttProvider; tts: TtsProviderRouter };
  audio: AudioOutput;
  agent: AgentStreamFn;
  /** Emit lifecycle + diagnostic events to the UI layer. */
  onEvent: (event: VoiceEngineEvent) => void;
  /** Called when the engine needs the user's chosen model id. */
  getModel: () => Promise<string | undefined>;
}

interface QueueItem {
  text: string;
  audio: Promise<TtsResult>;
}

export class VoiceEngine {
  private opts: VoiceEngineOptions;
  private epoch = 0;
  private phase: VoicePhase = 'idle';
  private sessionId: string | undefined;
  private queue: QueueItem[] = [];
  private draining = false;
  private pendingFinal = '';
  private listening = false;
  private stopHooks = new Set<() => void>();
  /** STT session token — a fresh start rebinds callbacks to the new epoch. */
  private sttEpoch = 0;

  constructor(options: VoiceEngineOptions) {
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

  /** Abort everything: cancel STT, agent stream, queued TTS and playback. */
  stop(): void {
    this.epoch += 1;
    this.sttEpoch += 1;
    this.listening = false;
    this.queue = [];
    this.draining = false;
    this.pendingFinal = '';
    for (const hook of this.stopHooks) {
      try {
        hook();
      } catch {}
    }
    this.stopHooks.clear();
    try {
      void this.opts.providers.stt.cancel();
    } catch {}
    try {
      this.opts.audio.stop();
    } catch {}
    this.opts.providers.tts.cancel();
    if (this.phase !== 'idle') this.setPhase('idle');
    voiceLog('VOICE_CANCELLED', 'engine-stop');
  }

  /** Volume set by the UI in real time (e.g. from a slider). */
  setVolume(volume: number): void {
    this.opts.audio.setVolume(volume);
    voiceLog('VOICE_CONFIG', `volume=${volume.toFixed(2)}`);
  }

  /* ------------------------------ listening ------------------------------ */

  async startListening(): Promise<void> {
    if (this.listening || this.phase === 'speaking' || this.phase === 'thinking') return;

    const epoch = this.epoch;
    const sttEpoch = ++this.sttEpoch;
    const { stt } = this.opts.providers;

    this.listening = true;
    this.setPhase('listening');
    this.pendingFinal = '';
    this.opts.onEvent({ type: 'partial', text: '' });

    const config = this.opts.config();
    try {
      await stt.start(config.locale, {
        onPartial: (text) => {
          if (this.sttEpoch !== sttEpoch || this.isStale(epoch)) return;
          this.opts.onEvent({ type: 'partial', text });
        },
        onFinal: (text) => {
          if (this.sttEpoch !== sttEpoch || this.isStale(epoch)) return;
          if (this.pendingFinal) return; // dedupe repeated final events
          this.pendingFinal = text;
          void this.finalize(text);
        },
        onVolume: (level) => {
          if (this.sttEpoch !== sttEpoch || this.isStale(epoch)) return;
          this.opts.onEvent({ type: 'stt-volume', level });
        },
        onError: (err) => {
          if (this.sttEpoch !== sttEpoch || this.isStale(epoch)) return;
          this.listening = false;
          if (this.phase === 'listening') this.setPhase('idle');
          this.opts.onEvent({ type: 'error', message: err.message });
        },
      });
    } catch (err) {
      this.listening = false;
      if (this.isStale(epoch)) return;
      this.setPhase('idle');
      this.opts.onEvent({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async finishListening(): Promise<void> {
    if (!this.listening) return;
    this.listening = false;
    // Finalize whatever partial text we have first, so the turn starts even
    // though stopping the recognizer may only emit an empty onFinal.
    const pending = this.pendingFinal;
    if (pending.trim()) {
      this.finalize(pending);
    }
    // Stopping can also fire its own onFinal; if we already started a turn the
    // phase guard makes it a no-op, and if we hadn't, an empty final lands on
    // the idle path below.
    try {
      await this.opts.providers.stt.stop();
    } catch {
      if (!pending.trim()) this.setPhase('idle');
    }
  }

  /* ------------------------------ the turn ------------------------------- */

  private async finalize(text: string): Promise<void> {
    // Guard against re-entry from a late onFinal after finishListening already
    // finalized the same (or an empty) utterance.
    if (this.phase !== 'listening') return;
    const epoch = this.epoch;
    const clean = text.trim();

    if (!clean) {
      if (this.isStale(epoch)) return;
      this.listening = false;
      this.setPhase('idle');
      if (this.opts.continuous()) {
        setTimeout(() => void this.startListening(), 250);
      }
      return;
    }

    this.listening = false;
    this.opts.onEvent({ type: 'turn', role: 'user', text: clean });
    this.setPhase('thinking');
    void this.runAgentTurn(clean, epoch);
  }

  private async runAgentTurn(clean: string, epoch: number): Promise<void> {
    const model = await this.opts.getModel().catch(() => undefined);
    if (this.isStale(epoch)) return;

    const controller = new AbortController();
    const abort = () => controller.abort();
    this.stopHooks.add(abort);
    const config = this.opts.config();

    try {
      const { reply, sessionId } = await this.opts.agent(clean, {
        sessionId: this.sessionId,
        model,
        signal: controller.signal,
        onDelta: (delta) => {
          if (this.isStale(epoch)) return;
          this.opts.onEvent({ type: 'partial', text: delta });
        },
        onSentence: (sentence) => {
          if (this.isStale(epoch)) return;
          this.enqueue(sentence);
        },
      });
      if (this.isStale(epoch)) return;
      this.sessionId = sessionId;
      this.opts.onEvent({ type: 'turn', role: 'agent', text: reply });

      // Let queued chunks finish speaking before re-arming the mic.
      await this.waitForDrain();
      if (this.isStale(epoch)) return;
      this.setPhase('idle');
      if (this.opts.continuous()) {
        setTimeout(() => void this.startListening(), 250);
      }
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
      this.queue = [];
      this.draining = false;
    }
  }

  /* ------------------------------ chunked TTS ---------------------------- */

  private enqueue(sentence: string): void {
    if (!sentence.trim()) return;
    const config = this.opts.config();
    const { tts } = this.opts.providers;

    // Split each arriving sentence into bounded chunks and synthesize each
    // one immediately — synthesis overlaps the chunk currently playing.
    for (const chunk of splitChunks(sentence)) {
      this.queue.push({
        text: chunk,
        audio: tts.synthesize({
          text: chunk,
          locale: config.locale,
          gender: config.gender,
          voiceId: undefined,
          speechRate: config.speakingRate,
          pitch: config.pitch,
          volume: config.volume,
          mode: config.mode,
        }),
      });
    }
    this.setPhase('speaking');
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    const epoch = this.epoch;
    const { audio } = this.opts;
    try {
      for (;;) {
        if (this.isStale(epoch) || this.queue.length === 0) break;
        const item = this.queue[0];
        try {
          const result = await item.audio;
          if (this.isStale(epoch)) break;
          this.queue.shift();
          if (result.kind === 'uri') {
            await audio.play(result.uri);
          } else {
            await result.speak();
          }
        } catch (err) {
          if (this.isStale(epoch)) break;
          this.queue.shift();
          this.diag('tts-cloud-failed');
          voiceLog('VOICE_ERROR', 'chunk-playback');
          this.opts.onEvent({
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } finally {
      this.draining = false;
      if (this.isStale(epoch)) return;
      this.opts.audio.stop();
    }
  }

  private waitForDrain(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.isStale(this.epoch) || (!this.draining && this.queue.length === 0)) {
          resolve();
        } else {
          setTimeout(check, 60);
        }
      };
      setTimeout(check, 60);
    });
  }
}