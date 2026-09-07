// YouTube Data API v3 client for the OSAMAH FLOW feed — resilient edition.
//
// Hard dependency on a single API key is gone. `searchShorts` now runs the
// OSAMAH API HUB failover engine: every configured YouTube key is tried in
// rotation (cooldown on quota/403/429), then public Piped and Invidious
// instances (auto-updated lists) take over when the YouTube API is exhausted —
// the feed keeps working with zero downtime.
import { type SQLiteDatabase } from 'expo-sqlite';
import { addFeedCache, getFeedCache, CachedVideo } from '@/utils/flow/flowDB';
import {
  runWithFailover,
  getYtKeyEntries,
  releaseYtKey,
  recordInstanceAttempt,
  getInstanceCandidates,
} from '@/utils/apiHub';

const YT_BASE = 'https://www.googleapis.com/youtube/v3';
const FETCH_TIMEOUT_MS = 8000;

async function fetchJson(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function regionCodeForLang(lang: string): string {
  return lang === 'ar' ? 'SA' : 'US';
}

export interface FlowVideo {
  ytId: string;
  title: string;
  channel: string;
  channelId: string;
  thumb: string;
  duration: number;
  description: string;
  publishedAt: number;
  lang: string;
}

export interface SearchPage {
  items: FlowVideo[];
  nextPageToken: string | null;
}

const THUMB_RES = 'medium';

/* ------------------------------------------------------------------ */
/* YouTube Data API v3 (keyed)                                         */
/* ------------------------------------------------------------------ */

async function ytSearch(key: string, query: string, lang: string, pageToken?: string): Promise<SearchPage> {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: query,
    videoDuration: 'short',
    videoEmbeddable: 'true',
    maxResults: '40',
    order: 'relevance',
    regionCode: regionCodeForLang(lang),
    safeSearch: 'strict',
    key,
  });
  if (pageToken) params.set('pageToken', pageToken);

  const res = await fetchJson(`${YT_BASE}/search?${params}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`yt/search ${res.status}`);
  const data = await res.json();
  const items: FlowVideo[] = (data.items ?? []).map((it: any) => ({
    ytId: it.id?.videoId ?? '',
    title: it.snippet?.title ?? '',
    channel: it.snippet?.channelTitle ?? '',
    channelId: it.snippet?.channelId ?? '',
    thumb: it.snippet?.thumbnails?.[THUMB_RES]?.url ?? it.snippet?.thumbnails?.default?.url ?? '',
    duration: 0,
    description: it.snippet?.description ?? '',
    publishedAt: Date.parse(it.snippet?.publishedAt ?? ''),
    lang,
  }));
  return {
    items: items.filter((v) => v.ytId),
    nextPageToken: data.nextPageToken ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Public instance providers (keyless fallbacks)                        */
/* ------------------------------------------------------------------ */

function quitIdFromUrl(url: string): string {
  const m = url.match(/[?&](?:v|id)=([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : '';
}

function mapPipedSearch(data: any, lang: string): FlowVideo[] {
  const items: FlowVideo[] = [];
  for (const it of data?.items ?? []) {
    const ytId = quitIdFromUrl(it?.url ?? '');
    if (!ytId) continue;
    items.push({
      ytId,
      title: it.title ?? '',
      channel: it.uploaderName ?? '',
      channelId: quitIdFromUrl(it.uploaderUrl ?? ''),
      thumb: it.thumbnail ?? '',
      duration: typeof it.duration === 'number' ? it.duration : 0,
      description: '',
      publishedAt: 0,
      lang,
    });
  }
  return items;
}

async function pipedSearch(baseUrl: string, query: string, lang: string): Promise<SearchPage> {
  const params = new URLSearchParams({
    q: query,
    filter: 'videos',
    region: regionCodeForLang(lang).toLowerCase(),
  });
  const res = await fetchJson(`${baseUrl}/search?${params}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`piped/search ${res.status}`);
  const data = await res.json();
  return { items: mapPipedSearch(data, lang), nextPageToken: data?.nextpage ?? null };
}

function mapInvidiousSearch(data: any, lang: string): FlowVideo[] {
  const items: FlowVideo[] = [];
  for (const it of data ?? []) {
    const ytId = it?.videoId ?? '';
    if (!ytId) continue;
    const thumbs: Array<{ quality?: string; url?: string }> = Array.isArray(it.videoThumbnails)
      ? it.videoThumbnails
      : [];
    const thumb = thumbs.find((t) => t.quality === THUMB_RES)?.url
      ?? thumbs.find((t) => t.quality === 'default')?.url
      ?? '';
    const published = it.published ?? 0;
    items.push({
      ytId,
      title: it.title ?? '',
      channel: it.author ?? '',
      channelId: it.authorId ?? '',
      thumb,
      duration: typeof it.lengthSeconds === 'number' ? it.lengthSeconds : 0,
      description: it.description ?? '',
      publishedAt: published > 0 && published < 1e12 ? published * 1000 : published,
      lang,
    });
  }
  return items;
}

async function invidiousSearch(baseUrl: string, query: string, lang: string): Promise<SearchPage> {
  const params = new URLSearchParams({
    q: query,
    type: 'video',
    region: regionCodeForLang(lang).toLowerCase(),
  });
  const res = await fetchJson(`${baseUrl}/api/v1/search?${params}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`invidious/search ${res.status}`);
  const data = await res.json();
  return { items: mapInvidiousSearch(data, lang), nextPageToken: null };
}

/* ------------------------------------------------------------------ */
/* Search with failover                                                 */
/* ------------------------------------------------------------------ */

/**
 * Search for short-form videos. Every YT key is tried in rotation; when the
 * keyed API is exhausted or errors, public Piped/Invidious instances (from the
 * auto-updated API HUB registry) take over. Returns an empty page only when
 * EVERY provider fails.
 */
export async function searchShorts(
  query: string,
  lang: string,
  pageToken?: string,
): Promise<SearchPage> {
  const attempts: Array<{
    label: string;
    kind: 'yt' | 'piped' | 'invidious';
    ref: string;
    run: () => Promise<SearchPage>;
  }> = [];

  const keys = await getYtKeyEntries();
  for (const entry of keys) {
    attempts.push({
      label: `yt:${entry.value.slice(-6)}`,
      kind: 'yt',
      ref: entry.value,
      run: () => ytSearch(entry.value, query, lang, pageToken),
    });
  }

  for (const base of await getInstanceCandidates('piped')) {
    attempts.push({ label: `piped:${base}`, kind: 'piped', ref: base, run: () => pipedSearch(base, query, lang) });
  }
  for (const base of await getInstanceCandidates('invidious')) {
    attempts.push({ label: `invidious:${base}`, kind: 'invidious', ref: base, run: () => invidiousSearch(base, query, lang) });
  }

  if (attempts.length === 0) return { items: [], nextPageToken: null };

  const result = await runWithFailover(
    attempts.map((a) => a.label),
    async (label) => {
      const attempt = attempts.find((a) => a.label === label);
      if (!attempt) throw new Error('unknown attempt');
      const page = await attempt.run();
      if (page.items.length === 0) throw new Error('empty search page');
      return page;
    },
    (label, ok) => {
      const attempt = attempts.find((a) => a.label === label);
      if (!attempt) return;
      if (attempt.kind === 'yt') {
        releaseYtKey(ok, attempt.ref);
      } else {
        recordInstanceAttempt(attempt.kind, attempt.ref, ok).catch(() => {});
      }
    },
  );

  if (!result.ok || !result.value) return { items: [], nextPageToken: null };
  return result.value;
}

/**
 * Enrich a batch of video IDs with contentDetails.duration (ISO 8601) via
 * videos.list, rotating across every configured YT key.
 */
export async function enrichDuration(
  ids: string[],
  lang: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));

  const keys = await getYtKeyEntries();
  if (keys.length === 0) return map;

  for (const chunk of chunks) {
    const idsParam = chunk.join(',');
    const labels = keys.map((k) => `yt:${k.value.slice(-6)}`);
    const result = await runWithFailover(
      labels,
      async (label, index) => {
        const entry = keys[index];
        if (!label.startsWith('yt:') || !entry) throw new Error('unknown key');
        const params = new URLSearchParams({
          part: 'contentDetails,statistics',
          id: idsParam,
          maxResults: '50',
          key: entry.value,
        });
        const res = await fetchJson(`${YT_BASE}/videos?${params}`);
        if (!res.ok) throw new Error(`yt/videos ${res.status}`);
        return (await res.json()) as { items?: Array<{ id?: string; contentDetails?: { duration?: string } }> };
      },
      (label, ok, index) => {
        const value = keys[index]?.value;
        if (value) releaseYtKey(ok, value);
      },
    );

    if (result.ok && result.value) {
      for (const item of result.value.items ?? []) {
        const iso = item.contentDetails?.duration ?? '';
        const secs = isoToSeconds(iso);
        if (item.id && secs > 0) map.set(item.id, secs);
      }
    }
  }
  return map;
}

function isoToSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? '0', 10) * 3600) + (parseInt(m[2] ?? '0', 10) * 60) + parseInt(m[3] ?? '0', 10);
}

/**
 * Full feed: fetch + enrich + persist to cache. Returns cached items for the page.
 */
export async function fetchFeedPage(
  db: SQLiteDatabase,
  query: string,
  lang: string,
  pageToken?: string,
): Promise<SearchPage> {
  const { items, nextPageToken } = await searchShorts(query, lang, pageToken);
  if (items.length === 0) return { items, nextPageToken };

  const ids = items.map((i) => i.ytId);
  const durations = await enrichDuration(ids, lang);

  for (const item of items) {
    item.duration = durations.get(item.ytId) ?? item.duration;
    await addFeedCache(db, {
      id: 0,
      ytId: item.ytId,
      title: item.title,
      channel: item.channel,
      channelId: item.channelId,
      thumb: item.thumb,
      duration: item.duration,
      description: item.description,
      publishedAt: item.publishedAt,
      lang: item.lang,
      fetchedAt: Date.now(),
    });
  }

  return { items, nextPageToken };
}

export { getFeedCache };