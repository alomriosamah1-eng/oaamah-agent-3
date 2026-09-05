// Internal voice-engine diagnostics. The level knob is gated by a developer
// build flag so production never logs transcripts or any sensitive payload.

const DEV_VOICE_LOGGING = false;

export type VoiceLogTag =
  | 'VOICE_START'
  | 'VOICE_PROVIDER_SELECTED'
  | 'VOICE_PROVIDER_FAILED'
  | 'VOICE_FAILOVER'
  | 'VOICE_STREAM_STARTED'
  | 'VOICE_STREAM_COMPLETED'
  | 'VOICE_CANCELLED'
  | 'VOICE_ERROR'
  | 'VOICE_CONFIG';

export function voiceLog(tag: VoiceLogTag, detail?: string): void {
  if (!DEV_VOICE_LOGGING) return;
  const line = `[${tag}]${detail ? ` ${detail}` : ''}`;
  // Keep user text out of these logs per policy — callers pass metadata only.
  console.debug(line);
}