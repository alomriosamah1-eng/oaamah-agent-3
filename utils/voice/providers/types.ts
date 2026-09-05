// Provider abstraction — the single contract every TTS/STT backend satisfies.
// The UI never talks to a concrete provider; everything reaches audio through
// a router that owns availability, timeout and failover policy.

export type ProviderId = 'azure' | 'google' | 'android';

export interface ProviderCapabilities {
  /** Whether the provider can run fully offline. */
  offline: boolean;
  /** True when the provider streams audio, false for whole-utterance fetch. */
  streaming: boolean;
}

export interface TtsRequest {
  text: string;
  locale: string;
  gender: 'male' | 'female';
  /** Optional explicit voice id override (from config). */
  voiceId?: string;
  speechRate: number;
  pitch: number;
  volume: number;
  /** Provider preference — the router maps it to an ordered chain. */
  mode: ProviderMode;
  signal?: AbortSignal;
}

export type ProviderMode = 'auto' | 'azure' | 'google' | 'android';

/**
 * Result of a TTS request. The router resolves a provider; the caller (engine)
 * then delivers audio out.
 *
 * - Cloud providers return `uri` audio the engine plays through its player
 *   (this lets the next sentence's synthesis overlap the current playback).
 * - The built-in platform TTS returns a `speak` closure that handles its own
 *   playback via the OS speech service.
 */
export type TtsResult =
  | { provider: 'azure' | 'google'; uri: string; sampleRate?: number; kind: 'uri' }
  | { provider: 'android'; kind: 'voice'; speak: () => Promise<void> };

export function isCloudResult(
  result: TtsResult,
): result is Extract<TtsResult, { kind: 'uri' }> {
  return result.kind === 'uri';
}

export interface VoiceProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  /** Cheap availability check used to skip dead providers fast. */
  isAvailable(): Promise<boolean>;
  getSupportedLocales(): Promise<string[]>;
  /** Synthesize text into audio. Throw on any failure to trigger failover. */
  synthesize(request: TtsRequest): Promise<TtsResult>;
  /** Cancel any in-flight synthesis. */
  cancel(): void;
}

export interface TtsProviderRouter {
  /** Resolve the first healthy provider, trying each until one succeeds. */
  synthesize(request: TtsRequest): Promise<TtsResult>;
  cancel(): void;
}