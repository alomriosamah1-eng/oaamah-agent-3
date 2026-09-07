// Persistent store for the OSAMAH FLOW feed. Pure data access — no UI.
import { type SQLiteDatabase } from 'expo-sqlite';

export type KeywordSource = 'profile' | 'skill' | 'agent' | 'manual' | 'avoid';

export interface FlowKeyword {
  id: number;
  text: string;
  source: KeywordSource;
  active: number;
  weight: number;
  createdAt: number;
}

export interface CachedVideo {
  id: number;
  ytId: string;
  title: string;
  channel: string;
  channelId: string;
  thumb: string;
  duration: number;
  description: string;
  publishedAt: number;
  lang: string;
  fetchedAt: number;
}

export interface CachedStream {
  id: number;
  ytId: string;
  url: string;
  quality: string;
  backend: string;
  expiresAt: number;
}

export interface SavedVideo {
  id: number;
  ytId: string;
  title: string;
  channel: string;
  thumb: string;
  localUri: string;
  quality: string;
  size: number;
  addedAt: number;
}

export type FlowHistoryAction = 'viewed' | 'skipped' | 'saved' | 'opened' | 'liked' | 'unfiltered';

/* ------------------------------------------------------------------ */
/* Keywords                                                            */
/* ------------------------------------------------------------------ */

export async function getActiveKeywords(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ text: string }>(
    "SELECT text FROM flow_keywords WHERE active = 1 AND source != 'avoid' ORDER BY weight DESC, id ASC"
  );
  return rows.map((r) => r.text);
}

export async function getAvoidKeywords(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ text: string }>(
    "SELECT text FROM flow_keywords WHERE active = 1 AND source = 'avoid'"
  );
  return rows.map((r) => r.text);
}

export async function addKeyword(db: SQLiteDatabase, text: string, source: KeywordSource, weight = 1): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  await db.runAsync(
    'INSERT INTO flow_keywords (text, source, active, weight, created_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(text) DO UPDATE SET source = excluded.source, weight = MAX(flow_keywords.weight, excluded.weight)',
    clean,
    source,
    weight,
    Date.now()
  );
}

export async function clearAgentKeywords(db: SQLiteDatabase): Promise<void> {
  await db.runAsync("DELETE FROM flow_keywords WHERE source IN ('agent', 'avoid')");
}

export async function setKeywordActive(db: SQLiteDatabase, text: string, active: boolean): Promise<void> {
  await db.runAsync('UPDATE flow_keywords SET active = ? WHERE text = ?', active ? 1 : 0, text);
}

export async function removeKeyword(db: SQLiteDatabase, text: string): Promise<void> {
  await db.runAsync('DELETE FROM flow_keywords WHERE text = ?', text);
}

export async function getAllKeywords(db: SQLiteDatabase): Promise<FlowKeyword[]> {
  return db.getAllAsync<FlowKeyword>('SELECT * FROM flow_keywords ORDER BY weight DESC, id ASC');
}

export async function keywordCount(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM flow_keywords WHERE active = 1');
  return row?.n ?? 0;
}

export async function lastKeywordUpdate(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ at: number }>('SELECT MAX(created_at) AS at FROM flow_keywords');
  return row?.at ?? 0;
}

/* ------------------------------------------------------------------ */
/* Feed cache (saves YouTube API quota)                                */
/* ------------------------------------------------------------------ */

export async function addFeedCache(db: SQLiteDatabase, v: CachedVideo): Promise<void> {
  await db.runAsync(
    `INSERT INTO flow_feed_cache (yt_id, title, channel, channel_id, thumb, duration, description, published_at, lang, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(yt_id) DO NOTHING`,
    v.ytId,
    v.title,
    v.channel,
    v.channelId ?? '',
    v.thumb ?? '',
    v.duration ?? 0,
    v.description ?? '',
    v.publishedAt ?? 0,
    v.lang,
    Date.now()
  );
}

export async function getFeedCache(db: SQLiteDatabase, lang: string, limit = 60): Promise<CachedVideo[]> {
  return db.getAllAsync<CachedVideo>(
    `SELECT id, yt_id AS ytId, title, channel, channel_id AS channelId, thumb, duration, description, published_at AS publishedAt, lang, fetched_at AS fetchedAt
       FROM flow_feed_cache WHERE lang = ? ORDER BY fetched_at DESC LIMIT ?`,
    lang,
    limit
  );
}

export async function clearFeedCache(db: SQLiteDatabase, lang: string): Promise<void> {
  await db.runAsync('DELETE FROM flow_feed_cache WHERE lang = ?', lang);
}

/* ------------------------------------------------------------------ */
/* Stream cache                                                        */
/* ------------------------------------------------------------------ */

export async function getStreamCache(db: SQLiteDatabase, ytId: string): Promise<CachedStream | null> {
  const row = await db.getFirstAsync<CachedStream>(
    `SELECT id, yt_id AS ytId, url, quality, backend, expires_at AS expiresAt
       FROM flow_stream_cache WHERE yt_id = ? AND expires_at > ?`,
    ytId,
    Date.now()
  );
  return row ?? null;
}

export async function setStreamCache(
  db: SQLiteDatabase,
  ytId: string,
  url: string,
  quality: string,
  backend: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO flow_stream_cache (yt_id, url, quality, backend, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(yt_id) DO UPDATE SET url = excluded.url, quality = excluded.quality, backend = excluded.backend, expires_at = excluded.expires_at`,
    ytId,
    url,
    quality,
    backend,
    Date.now() + 6 * 60 * 60 * 1000
  );
}

/** Drop a cached stream URL so the resolver is forced to pick another provider. */
export async function clearStreamCache(db: SQLiteDatabase, ytId: string): Promise<void> {
  await db.runAsync('DELETE FROM flow_stream_cache WHERE yt_id = ?', ytId);
}

/* ------------------------------------------------------------------ */
/* Offline saves (real MP4 files on device)                            */
/* ------------------------------------------------------------------ */

export async function addSavedVideo(db: SQLiteDatabase, v: SavedVideo): Promise<void> {
  await db.runAsync(
    `INSERT INTO flow_saved (yt_id, title, channel, thumb, local_uri, quality, size, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(yt_id) DO UPDATE SET title = excluded.title, channel = excluded.channel, thumb = excluded.thumb, quality = excluded.quality, size = excluded.size`,
    v.ytId,
    v.title,
    v.channel,
    v.thumb ?? '',
    v.localUri,
    v.quality,
    v.size,
    Date.now()
  );
}

export async function getSavedVideos(db: SQLiteDatabase): Promise<SavedVideo[]> {
  return db.getAllAsync<SavedVideo>(
    `SELECT id, yt_id AS ytId, title, channel, thumb, local_uri AS localUri, quality, size, added_at AS addedAt
       FROM flow_saved ORDER BY added_at DESC`
  );
}

export async function isSaved(db: SQLiteDatabase, ytId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM flow_saved WHERE yt_id = ?', ytId);
  return (row?.n ?? 0) > 0;
}

export async function removeSavedVideo(db: SQLiteDatabase, ytId: string): Promise<void> {
  await db.runAsync('DELETE FROM flow_saved WHERE yt_id = ?', ytId);
}

export async function getSavedByYtId(db: SQLiteDatabase, ytId: string): Promise<SavedVideo | null> {
  const row = await db.getFirstAsync<SavedVideo>(
    `SELECT id, yt_id AS ytId, title, channel, thumb, local_uri AS localUri, quality, size, added_at AS addedAt
       FROM flow_saved WHERE yt_id = ?`,
    ytId
  );
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Liked registry (persistent)                                         */
/* ------------------------------------------------------------------ */

export async function getLikedIds(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ ytId: string }>('SELECT yt_id AS ytId FROM flow_liked ORDER BY added_at DESC');
  return rows.map((r) => r.ytId);
}

export async function addLiked(db: SQLiteDatabase, ytId: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO flow_liked (yt_id, added_at) VALUES (?, ?) ON CONFLICT(yt_id) DO UPDATE SET added_at = excluded.added_at',
    ytId,
    Date.now()
  );
}

export async function removeLiked(db: SQLiteDatabase, ytId: string): Promise<void> {
  await db.runAsync('DELETE FROM flow_liked WHERE yt_id = ?', ytId);
}

/* ------------------------------------------------------------------ */
/* Interaction history (agent feedback)                                */
/* ------------------------------------------------------------------ */

export async function addFlowHistory(
  db: SQLiteDatabase,
  ytId: string,
  action: FlowHistoryAction,
  keywordAtView?: string
): Promise<void> {
  await db.runAsync(
    'INSERT INTO flow_history (yt_id, action, keyword_at_view, at) VALUES (?, ?, ?, ?)',
    ytId,
    action,
    keywordAtView ?? '',
    Date.now()
  );
}

export async function getFlowHistory(db: SQLiteDatabase, limit = 200): Promise<{ ytId: string; action: string; at: number }[]> {
  return db.getAllAsync<{ ytId: string; action: string; at: number }>(
    'SELECT yt_id AS ytId, action, at FROM flow_history ORDER BY at DESC LIMIT ?',
    limit
  );
}