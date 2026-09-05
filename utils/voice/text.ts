// Text helpers shared by the engine and providers — cleaning agent Markdown
// into speakable prose and splitting long replies into bounded utterance
// chunks. Ported verbatim from the retired voice server client (the cleanup
// behaviour is preserved; only the transport changed).

/** Clean assistant Markdown into something a TTS engine can read aloud. */
export function speakableText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_`>|#~]/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Split text into speakable chunks so the first chunk can start while later
 * ones are still being synthesized. Being aggressive here never hurts a cloud
 * provider (it simply receives a few audio files instead of one) and it keeps
 * the platform TTS from choking on long strings.
 */
export function splitChunks(text: string, maxLen = 220): string[] {
  const clean = speakableText(text);
  if (!clean) return [];
  const parts = clean.split(/(?<=[.!؟؟…])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    if (!part.trim()) continue;
    if (current && current.length + part.length + 1 > maxLen) {
      chunks.push(current.trim());
      current = part;
    } else {
      current = current ? `${current} ${part}` : part;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}