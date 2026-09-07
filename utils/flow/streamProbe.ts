// Stream sanity probe.
//
// When a resolver returns a URL (Innertube / Piped / Invidious), that URL may
// actually be an HTML error page, a blocked 200-with-HTML response, or a JSON
// challenge instead of a real media stream. Handing those to the native player
// (ExoPlayer/AVPlayer) is the #1 cause of Android hard crashes / freezes right
// after playback starts.
//
// `probeStream` does one cheap ranged GET and accepts the URL only when the
// response looks like real media — so the native player is only ever given
// verifiable video. Unverifiable (network error/timeout) URLs are accepted
// optimistically; the unit has its own error → poster path as a backstop.

const PROBE_TIMEOUT_MS = 4_000;
const probeCache = new Map<string, boolean>();

export function markStreamGood(url: string): void {
  probeCache.set(url, true);
}

export async function probeStream(url: string): Promise<boolean> {
  const hit = probeCache.get(url);
  if (hit !== undefined) return hit;
  const verdict = await rawProbe(url);
  probeCache.set(url, verdict);
  return verdict;
}

async function rawProbe(url: string): Promise<boolean> {
  // Obvious HLS manifests never need a probe.
  if (url.includes('.m3u8')) return true;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0', 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal,
    });
    if (res.status !== 200 && res.status !== 206) return false;

    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (type === '') return true; // no header → assume media
    if (type.startsWith('video/') || type.startsWith('audio/') || type.includes('mpegurl')) return true;
    if (type.startsWith('text/')) return false; // HTML error page — reject
    if (type.includes('json')) return false;
    return true;
  } catch {
    // Could not verify (timeout / DNS / server dropped HEAD-ish request).
    // Let the player attempt it; the unit reports an error state if needed.
    return true;
  } finally {
    clearTimeout(timer);
  }
}