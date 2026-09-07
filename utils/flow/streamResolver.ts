// Resolves YouTube video IDs to playable MP4 / HLS URLs.
// Primary: direct YouTube Innertube extraction (ANDROID client) — reliable,
// no third-party instance required. Fallbacks: Piped + Invidious public APIs,
// using the OSAMAH API HUB auto-updated instance registry with health-based
// failover (dead instances sink to the back automatically).

import { type SQLiteDatabase } from 'expo-sqlite';
import { getStreamCache, setStreamCache } from '@/utils/flow/flowDB';
import {
  runWithFailover,
  getInstanceCandidates,
  recordInstanceAttempt,
} from '@/utils/apiHub';

export type StreamQuality = 'low' | 'medium' | 'high';

const QUALITY_HEIGHT: Record<StreamQuality, number> = { low: 240, medium: 360, high: 480 };

/** A cached stream is usable for a target quality when its muxed height falls in the playable band. */
export function streamFitsQuality(cached: ResolvedStream | undefined | null, target: StreamQuality): boolean {
  if (!cached || !cached.url) return false;
  const h = parseInt(cached.quality, 10);
  if (Number.isNaN(h)) return target === 'high'; // HLS treated as high
  return h >= 240 && h <= 720;
}

// Public key shipped by the Android YouTube app (used for labelled requests).
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_ANDROID = {
  clientName: 'ANDROID',
  clientVersion: '20.05.41',
  androidSdkVersion: 30,
  hl: 'en',
  gl: 'US',
};

export interface ResolvedStream {
  url: string;
  quality: string;
  backend: string;
  contentType: 'progressive' | 'hls';
}

interface PipedStreamEntry {
  url: string;
  mimeType?: string;
  format?: string;
  quality?: string;
  height?: number;
  videoOnly?: boolean;
  bitrate?: number;
}

interface InvidiousEntry {
  url?: string;
  type?: string;
  qualityLabel?: string;
  itag?: number;
  audioQuality?: string;
  bitrate?: number;
}

/* ------------------------------------------------------------------ */
/* Cache layer                                                         */
/* ------------------------------------------------------------------ */

async function getCachedStream(db: SQLiteDatabase, ytId: string): Promise<ResolvedStream | null> {
  const cache = await getStreamCache(db, ytId);
  if (!cache) return null;
  return {
    url: cache.url,
    quality: cache.quality,
    backend: cache.backend,
    contentType: cache.url.includes('.m3u8') ? 'hls' : 'progressive',
  };
}

async function setCachedStream(
  db: SQLiteDatabase,
  ytId: string,
  stream: ResolvedStream,
): Promise<void> {
  await setStreamCache(db, ytId, stream.url, stream.quality, stream.backend);
}

/* ------------------------------------------------------------------ */
/* Piped                                                               */
/* ------------------------------------------------------------------ */

function pickPiped(
  data: any,
  target: StreamQuality,
): ResolvedStream | null {
  const h = QUALITY_HEIGHT[target];
  const videoStreams: PipedStreamEntry[] = data?.videoStreams ?? [];
  const audioStreams: PipedStreamEntry[] = data?.audioStreams ?? [];

  // Prefer muxed mp4 (audio+video together) — plays directly without mixing.
  const muxed = videoStreams.filter(
    (s) => !s.videoOnly && s.mimeType?.startsWith('video/mp4'),
  );

  if (muxed.length > 0) {
    // pick closest to target height
    const best = pickClosest(muxed, h);
    return {
      url: best.url,
      quality: best.quality ?? '360p',
      backend: 'piped',
      contentType: 'progressive',
    };
  }

  // HLS fallback
  const hls = videoStreams.find((s) => s.mimeType?.includes('x-mpegurl') || s.url?.includes('.m3u8'));
  if (hls) {
    return {
      url: hls.url,
      quality: 'hls',
      backend: 'piped',
      contentType: 'hls',
    };
  }

  return null;
}

function pickClosest(streams: PipedStreamEntry[], targetH: number): PipedStreamEntry {
  let best = streams[0];
  let bestDist = Math.abs((best.height ?? 0) - targetH);
  for (let i = 1; i < streams.length; i++) {
    const dist = Math.abs((streams[i].height ?? 0) - targetH);
    if (dist < bestDist) {
      best = streams[i];
      bestDist = dist;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Invidious                                                           */
/* ------------------------------------------------------------------ */

function pickInvidious(
  data: any,
  target: StreamQuality,
): ResolvedStream | null {
  const fmt: InvidiousEntry[] = data?.formatStreams ?? [];

  // Invidious formatStreams are muxed (audio+video) — prefer these.
  const mp4 = fmt.filter((f) => f.url && f.type?.startsWith('video/mp4'));
  if (mp4.length > 0) {
    const best = pickClosestInvidious(mp4, target);
    return {
      url: best.url!,
      quality: best.qualityLabel ?? '360p',
      backend: 'invidious',
      contentType: 'progressive',
    };
  }

  // HLS
  const hls = fmt.find((f) => f.url && f.type?.includes('x-mpegurl'));
  if (hls) {
    return {
      url: hls.url!,
      quality: 'hls',
      backend: 'invidious',
      contentType: 'hls',
    };
  }

  return null;
}

function pickClosestInvidious(streams: InvidiousEntry[], target: StreamQuality): InvidiousEntry {
  const targetH = QUALITY_HEIGHT[target];
  let best = streams[0];
  let bestDist = heightFromLabel(best.qualityLabel ?? '');
  for (let i = 1; i < streams.length; i++) {
    const dist = Math.abs(heightFromLabel(streams[i].qualityLabel ?? '') - targetH);
    if (dist < bestDist) {
      best = streams[i];
      bestDist = dist;
    }
  }
  return best;
}

function heightFromLabel(label: string): number {
  const m = label.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 360;
}

/* ------------------------------------------------------------------ */
/* Innertube (direct YouTube extraction — primary)                     */
/* ------------------------------------------------------------------ */

interface InnertubeFormat {
  url?: string;
  itag?: number;
  mimeType?: string;
  height?: number;
  qualityLabel?: string;
}

async function callInnertube(ytId: string): Promise<any | null> {
  const payload = {
    context: { client: { ...INNERTUBE_ANDROID } },
    videoId: ytId,
  };
  const attempts = [``, `?key=${INNERTUBE_KEY}`];
  for (const suffix of attempts) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(`https://www.youtube.com/youtubei/v1/player${suffix}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 200) return await res.json();
    } catch {
      continue;
    }
  }
  return null;
}

function pickInnertube(data: any, target: StreamQuality): ResolvedStream | null {
  if (!data || data.playabilityStatus?.status !== 'OK' || !data.streamingData) return null;

  const formats: InnertubeFormat[] = data.streamingData.formats ?? [];
  const h = QUALITY_HEIGHT[target];

  // Prefer muxed mp4 (audio+video combined) — plays directly.
  const muxed = formats.filter((f) => f.url && f.mimeType?.startsWith('video/mp4'));
  if (muxed.length > 0) {
    const best = pickClosest(muxed as PipedStreamEntry[], h);
    return {
      url: best.url!,
      quality: `${best.height ?? 360}p`,
      backend: 'innertube',
      contentType: 'progressive',
    };
  }

  // Any other progressive format
  const anyProgressive = formats.find((f) => f.url);
  if (anyProgressive?.url) {
    return {
      url: anyProgressive.url,
      quality: `hls`,
      backend: 'innertube',
      contentType: 'progressive',
    };
  }

  const hls = data.streamingData.hlsManifestUrl as string | undefined;
  if (hls) {
    return { url: hls, quality: 'hls', backend: 'innertube', contentType: 'hls' };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

async function tryPiped(ytId: string, quality: StreamQuality): Promise<ResolvedStream | null> {
  const candidates = await getInstanceCandidates('piped');
  if (candidates.length === 0) return null;
  const result = await runWithFailover(
    candidates,
    async (base) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6_000);
      try {
        const res = await fetch(`${base}/streams/${ytId}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`piped ${res.status}`);
        const stream = pickPiped(await res.json(), quality);
        if (!stream) throw new Error('no usable stream');
        return stream;
      } finally {
        clearTimeout(timer);
      }
    },
    (base, ok) => recordInstanceAttempt('piped', base, ok).catch(() => {}),
  );
  return result.ok && result.value ? result.value : null;
}

async function tryInvidious(ytId: string, quality: StreamQuality): Promise<ResolvedStream | null> {
  const candidates = await getInstanceCandidates('invidious');
  if (candidates.length === 0) return null;
  const result = await runWithFailover(
    candidates,
    async (base) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6_000);
      try {
        const res = await fetch(`${base}/api/v1/videos/${ytId}?fields=formatStreams`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`invidious ${res.status}`);
        const stream = pickInvidious(await res.json(), quality);
        if (!stream) throw new Error('no usable stream');
        return stream;
      } finally {
        clearTimeout(timer);
      }
    },
    (base, ok) => recordInstanceAttempt('invidious', base, ok).catch(() => {}),
  );
  return result.ok && result.value ? result.value : null;
}

export async function resolveStream(
  db: SQLiteDatabase,
  ytId: string,
  quality: StreamQuality = 'medium',
): Promise<ResolvedStream | null> {
  // fast path
  const cached = await getCachedStream(db, ytId);
  if (cached) return cached;

  // Direct YouTube extraction (most reliable)
  const innertube = pickInnertube(await callInnertube(ytId), quality);
  if (innertube) {
    await setCachedStream(db, ytId, innertube);
    return innertube;
  }

  // Piped instances (auto-updated, health-ordered)
  const piped = await tryPiped(ytId, quality);
  if (piped) {
    await setCachedStream(db, ytId, piped);
    return piped;
  }

  // Invidious instances
  const invidious = await tryInvidious(ytId, quality);
  if (invidious) {
    await setCachedStream(db, ytId, invidious);
    return invidious;
  }

  return null;
}