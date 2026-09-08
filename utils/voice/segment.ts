// Streaming-speech segmentation (pure, expo-free) — sees the agent's reply
// as a growing text buffer and cuts it into speakable beats so the first
// words can be spoken long before the answer finishes.
//
// The reply is spoken CONTINUOUSLY, the way a person reads aloud: a beat is a
// full sentence (or more), never a comma-separated fragment, and short
// sentences are merged into the surrounding text instead of being rattled off
// one by one. Every cut here becomes a separate TTS synthesis, so cutting
// sparingly is what keeps the voice fluid instead of choppy.

/** True sentence enders — a beat only ever ends on these, never on commas. */
const SEG_BOUNDARY = /[.!؟?…]/;
/** Buffer grows past this and we force a cut at a space to keep the cadence. */
const MAX_BUFFER = 160;
/** A completed beat shorter than this is merged into the next one — tiny
 *  utterances would each cost their own TTS round-trip and stutter. */
const MIN_SEGMENT = 24;

/**
 * Chop `buffer` at sentence boundaries, returning the complete segments to
 * speak plus the unsent remainder. The agent streams "the full reply so far"
 * (set-semantics), so the caller only ever feeds this the NEW suffix — the
 * remainder here is carried across calls until the reply ends.
 */
export function splitSpeechSegments(buffer: string): { out: string[]; rest: string } {
  let rest = buffer;
  const out: string[] = [];
  // Completed beats too short to speak alone — they ride along with the next
  // worthier cut instead of stuttering out as their own TTS round-trip.
  let pending = '';
  for (;;) {
    let cut = -1;
    for (let i = 0; i < rest.length; i++) {
      if (SEG_BOUNDARY.test(rest[i]!)) {
        cut = i + 1;
        break;
      }
    }
    if (cut <= 0) break;
    const seg = rest.slice(0, cut).trim();
    rest = rest.slice(cut);
    if (!seg) continue;
    const merged = pending === '' ? seg : `${pending} ${seg}`.trim();
    if (merged.length >= MIN_SEGMENT) {
      pending = '';
      out.push(merged);
    } else {
      pending = merged;
    }
  }
  // Pending beats go back to the front of the remainder so the next feed
  // continues right where they left off — nothing is lost, nothing re-spoken.
  if (pending) rest = `${pending} ${rest}`.trimStart();
  // No punctuation for a long stretch — cut at a space so speech keeps pace
  // with the model instead of waiting for a full stop.
  if (rest.length > MAX_BUFFER) {
    const sp = rest.lastIndexOf(' ', Math.floor(rest.length * 0.75));
    if (sp > MIN_SEGMENT) {
      const seg = rest.slice(0, sp).trim();
      if (seg) out.push(seg);
      rest = rest.slice(sp).trimStart();
    }
  }
  return { out, rest };
}