// Storage Maintenance — PURE core (Node-testable, zero native imports).
//
// This module defines the hard boundary of the "إدارة التخزين" feature:
// only user-scope inputs/outputs may ever be cleaned. Anything in the
// protected sets below is off-limits by design AND enforced by tests.
//
// Keep this file free of imports from expo / react-native / AsyncStorage so
// the Node test suite can exercise it (see tests/storageMaintenance.test.ts).

/** Identifiable storage categories (user scope only). */
export type StorageCategoryId = 'knowledge' | 'records' | 'videos' | 'saved' | 'profile' | 'cache';

export const ALL_CATEGORIES: readonly StorageCategoryId[] = [
  'knowledge',
  'videos',
  'saved',
  'records',
  'profile',
  'cache',
];

/**
 * AsyncStorage keys that are SYSTEM / software and MUST NEVER be removed:
 * connection (serverUrl/serverUser/serverPass), API & voice keys, model and
 * app preferences, FLOW runtime prefs and the api-hub instance registry.
 */
export const PROTECTED_ASYNC_KEYS: readonly string[] = [
  'chatgpt:language',
  'chatgpt:speakOutput',
  'chatgpt:customModel',
  'chatgpt:userName',
  'chatgpt:serverUrl',
  'chatgpt:serverUser',
  'chatgpt:serverPass',
  'chatgpt:modelID',
  'chatgpt:modelProvider',
  'chatgpt:skillsLastCheck',
  'chatgpt:flowRotCursor',
  'chatgpt:flowVolume',
  'chatgpt:flowMuted',
  'chatgpt:flowKeywordsLastRefresh',
  'chatgpt:voiceConfig',
  'chatgpt:voiceLastChatId',
  'chatgpt:voice:keys:stt',
  'chatgpt:voice:keys:tts',
  'chatgpt:apihub-instances-v1',
  'chatgpt:apihub-user-yt-keys',
  'chatgpt:apihub-meta',
  'osamah:taskType',
];

/** AsyncStorage keys that belong to the user scope and are removable. */
export const USER_ASYNC_KEYS: readonly string[] = ['osamah:userProfile', 'osamah:savedFiles'];

/**
 * SQLite tables that drive app systems and MUST NEVER be wiped:
 * flow_keywords feeds the FLOW feed; flow_liked is a system signal.
 */
export const PROTECTED_TABLES: readonly string[] = ['flow_keywords', 'flow_liked'];

/** SQLite tables in the user scope (whitelist). */
export const USER_DATA_TABLES: readonly string[] = [
  'messages',
  'chats',
  'prompt_messages',
  'prompt_sessions',
  'prompt_maker_history',
  'flow_history',
  'flow_saved',
  'flow_feed_cache',
  'flow_stream_cache',
];

/** Tables wiped by the quick "temp cache" cleaner (self-healing caches). */
export const CACHE_ONLY_TABLES: readonly string[] = ['flow_feed_cache', 'flow_stream_cache'];

/** Tables wiped by the "records" action. */
export const RECORDS_TABLES: readonly string[] = ['prompt_maker_history', 'flow_history'];

export const KB = 1024;
export const MB = 1024 * 1024;
export const GB = 1024 * 1024 * 1024;

/** Human-readable byte label, Arabic-friendly ("X٫Y MB"). */
export function bytesLabel(bytes: number): string {
  const n = Math.max(0, Math.round(bytes || 0));
  if (n < KB) return `${n} B`;
  if (n < MB) return `${(n / KB).toFixed(1)} KB`;
  if (n < GB) return `${(n / MB).toFixed(1)} MB`;
  return `${(n / GB).toFixed(2)} GB`;
}

export interface CategoryUsage {
  id: StorageCategoryId;
  /** Real bytes on device (0 when unmeasurable). */
  bytes: number;
  /** Item / row count. */
  count: number;
}

export interface StorageBreakdown {
  totalBytes: number;
  cacheFileCount: number;
  categories: CategoryUsage[];
}

export interface CategoryInput {
  bytes: number;
  count: number;
}

/**
 * Assemble a breakdown from per-category measurements. Categories missing
 * from the input are inserted as zero so the UI always renders all segments.
 */
export function assembleBreakdown(input: Partial<Record<StorageCategoryId, CategoryInput>>): StorageBreakdown {
  const categories: CategoryUsage[] = ALL_CATEGORIES.map((id) => {
    const v = input[id];
    const bytes = Math.max(0, Math.round(v?.bytes ?? 0));
    const count = Math.max(0, Math.round(v?.count ?? 0));
    return { id, bytes, count };
  });
  const totalBytes = categories.reduce((sum, c) => sum + c.bytes, 0);
  const cacheFileCount = input.cache?.count ?? 0;
  return { totalBytes, cacheFileCount, categories };
}

/** Sum of the byte deltas for the given categories (used for "freed" banner). */
export function freedBytes(before: StorageBreakdown, after: StorageBreakdown, ids: readonly StorageCategoryId[]): number {
  let freed = 0;
  for (const id of ids) {
    const b = before.categories.find((c) => c.id === id)?.bytes ?? 0;
    const a = after.categories.find((c) => c.id === id)?.bytes ?? 0;
    freed += Math.max(0, b - a);
  }
  return freed;
}

/** True when no user-scope key collides with the protected boundary. */
export function isCleanSurfaceSafe(): boolean {
  const user = new Set(USER_ASYNC_KEYS);
  const conflictAsync = PROTECTED_ASYNC_KEYS.some((k) => user.has(k));
  const conflictTables = USER_DATA_TABLES.some((t) => PROTECTED_TABLES.includes(t));
  return !conflictAsync && !conflictTables;
}