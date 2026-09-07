// OSAMAH API HUB — React-Native store (persistence + live auto-update).
//
// Thin adapter over `core.ts` (pure logic). Responsibilities:
//  - key chain: expo-config keys + AsyncStorage user keys (rotation via core);
//  - instance registry: bundled seeds → discovered lists auto-updated from
//    upstream mirrors, always falling back to the last-known-good list;
//  - resilient refresh that NEVER throws — a failed update keeps the old list.
import Constants from 'expo-constants';
import { storage } from '@/utils/Storage';
import {
  normalizeKeyChain,
  nextKey,
  penalizeKey as penalizeCursorKey,
  createKeyCursor,
  type KeyEntry,
  type ExternalInstance,
  type InstanceState,
  parseInvidiousInstances,
  parsePipedInstances,
  mergeInstances,
  buildCandidateOrder,
  markAttempt,
  type KeyCursor,
} from '@/utils/apiHub/core';

/* ------------------------------------------------------------------ */
/* Bundled seeds (used only until a successful auto-update)            */
/* ------------------------------------------------------------------ */

export const BUNDLED_INSTANCES: ExternalInstance[] = [
  { id: 'piped-kavin', kind: 'piped', baseUrl: 'https://pipedapi.kavin.rocks', healthy: true, source: 'bundled' },
  { id: 'piped-pipedyt', kind: 'piped', baseUrl: 'https://api.piped.yt', healthy: true, source: 'bundled' },
  { id: 'piped-adminforge', kind: 'piped', baseUrl: 'https://pipedapi.adminforge.de', healthy: true, source: 'bundled' },
  { id: 'piped-privacycom', kind: 'piped', baseUrl: 'https://piped-api.privacy.com.de', healthy: true, source: 'bundled' },
  { id: 'piped-lunar', kind: 'piped', baseUrl: 'https://piped-api.lunar.icu', healthy: true, source: 'bundled' },
  { id: 'invidious-nadeko', kind: 'invidious', baseUrl: 'https://inv.nadeko.net', healthy: true, source: 'bundled' },
  { id: 'invidious-yewtu', kind: 'invidious', baseUrl: 'https://yewtu.be', healthy: true, source: 'bundled' },
  { id: 'invidious-nerdvpn', kind: 'invidious', baseUrl: 'https://invidious.nerdvpn.de', healthy: true, source: 'bundled' },
  { id: 'invidious-puffyanus', kind: 'invidious', baseUrl: 'https://vid.puffyan.us', healthy: true, source: 'bundled' },
];

/* ------------------------------------------------------------------ */
/* Persistence keys                                                    */
/* ------------------------------------------------------------------ */

const INSTANCES_KEY = 'apihub-instances-v1';
const USER_YT_KEYS_KEY = 'apihub-user-yt-keys';
const META_KEY = 'apihub-meta';

const INSTANCES_STALE_MS = 6 * 60 * 60 * 1000; // auto-update once per 6h
const KEY_COOLDOWN_MS = 5 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Key chain (YouTube Data API)                                        */
/* ------------------------------------------------------------------ */

let ytCursor: KeyCursor | null = null;
let cursorLoadedAt = 0;
const CURSOR_CACHE_MS = 15_000;

function configYtKeyValues(): Array<string | undefined> {
  const extra = Constants.expoConfig?.extra as
    | { ytApiKeys?: string[]; ytApiKey?: string }
    | undefined;
  const arr = Array.isArray(extra?.ytApiKeys) ? extra.ytApiKeys : [];
  return [...arr, extra?.ytApiKey];
}

async function userYtKeyValues(): Promise<string[]> {
  try {
    const raw = await storage.getString(USER_YT_KEYS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s: unknown) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/** Full YT key chain (config keys first, user keys appended). Cheap. */
export async function getYtKeyEntries(): Promise<KeyEntry[]> {
  const user = await userYtKeyValues();
  return normalizeKeyChain(configYtKeyValues(), user, 'youtube');
}

/** Round-robin cursor with cooldown — used across search calls. */
export async function ytKeyCursor(now = Date.now()): Promise<KeyCursor> {
  if (ytCursor && now - cursorLoadedAt < CURSOR_CACHE_MS) return ytCursor;
  ytCursor = createKeyCursor(await getYtKeyEntries(), now);
  cursorLoadedAt = now;
  return ytCursor;
}

export async function addUserYoutubeKey(value: string): Promise<void> {
  const v = (value ?? '').trim();
  if (!v) return;
  const user = await userYtKeyValues();
  if (user.includes(v)) return;
  user.push(v);
  await storage.set(USER_YT_KEYS_KEY, JSON.stringify(user));
  ytCursor = null; // bust cache
}

export async function removeUserYoutubeKey(value: string): Promise<void> {
  const user = (await userYtKeyValues()).filter((k) => k !== value);
  await storage.set(USER_YT_KEYS_KEY, JSON.stringify(user));
  ytCursor = null;
}

/** Grab the next usable YT key (skips cooled-down ones). */
export async function acquireYtKey(tmp = Date.now()): Promise<{ value: string; kind: 'key' | 'none' } | null> {
  const cursor = await ytKeyCursor(tmp);
  const pick = nextKey(cursor, tmp, KEY_COOLDOWN_MS);
  return pick ? { value: pick.key.value, kind: 'key' } : null;
}

export function releaseYtKey(success: boolean, usedValue: string, tmp = Date.now()): void {
  if (!ytCursor) return;
  const entry = ytCursor.values.find((k) => k.value === usedValue);
  if (!entry) return;
  if (!success) penalizeCursorKey(ytCursor, entry.id, tmp, KEY_COOLDOWN_MS);
}

/* ------------------------------------------------------------------ */
/* Instance registry                                                   */
/* ------------------------------------------------------------------ */

let stateCache: InstanceState | null = null;
let stateCachedAt = 0;
const STATE_CACHE_MS = 30_000;

async function seedState(): Promise<InstanceState> {
  return { instances: [...BUNDLED_INSTANCES], lastUpdated: 0 };
}

async function loadState(): Promise<InstanceState> {
  const cachedNow = Date.now();
  if (stateCache && cachedNow - stateCachedAt < STATE_CACHE_MS) return stateCache;
  try {
    const raw = await storage.getString(INSTANCES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as InstanceState;
      const list = Array.isArray(parsed?.instances) ? parsed.instances : [];
      stateCache = { instances: list, lastUpdated: parsed.lastUpdated ?? 0 };
    } else {
      stateCache = await seedState();
    }
  } catch {
    stateCache = await seedState();
  }
  stateCachedAt = cachedNow;
  return stateCache;
}

async function persistState(state: InstanceState): Promise<void> {
  stateCache = state;
  stateCachedAt = Date.now();
  await storage.set(INSTANCES_KEY, JSON.stringify(state));
}

/** Ordered base URLs for a kind (healthy first) — feeds runWithFailover. */
export async function getInstanceCandidates(kind: string): Promise<string[]> {
  const state = await loadState();
  const ordered = buildCandidateOrder(state.instances, kind);
  return ordered.length > 0 ? ordered : buildCandidateOrder(BUNDLED_INSTANCES, kind);
}

/** Record an attempt outcome and persist (debounced). */
export async function recordInstanceAttempt(
  kind: string,
  baseUrl: string,
  ok: boolean,
  tmp = Date.now(),
): Promise<void> {
  const state = await loadState();
  const next = markAttempt(state.instances, baseUrl, ok, tmp);
  if (next === state.instances) return;
  await persistState({ ...state, instances: next });
}

/* ------------------------------------------------------------------ */
/* Auto-update                                                         */
/* ------------------------------------------------------------------ */

const PIPED_UPSTREAMS = [
  'https://pipedapi.kavin.rocks/api/instances',
  'https://api.piped.yt/api/instances',
  'https://instances.piped.video/api/instances',
  'https://raw.githubusercontent.com/TeamPiped/Piped-instances/master/instances.json',
];
const INVIDIOUS_UPSTREAM = 'https://api.invidious.io/instances.json';

async function fetchText(url: string, timeoutMs = 10_000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json, text/plain' } });
      if (!res.ok) return null;
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export interface RefreshSummary {
  refreshed: boolean;
  discovered: { piped: number; invidious: number };
  errors: string[];
}

/**
 * Fetch the latest public instance lists from every upstream mirror and merge
 * them into the registry. NEVER throws: any failure leaves the previous
 * (bundled or last-good) list intact.
 */
export async function refreshInstancesFromUpstream(tmp = Date.now()): Promise<RefreshSummary> {
  const state = await loadState();
  let discoveredPiped: ExternalInstance[] = [];
  let discoveredInvidious: ExternalInstance[] = [];
  const errors: string[] = [];

  for (const url of PIPED_UPSTREAMS) {
    const text = await fetchText(url);
    if (!text) {
      errors.push(url);
      continue;
    }
    discoveredPiped = parsePipedInstances(text, tmp);
    if (discoveredPiped.length > 0) break;
  }

  const invidiousText = await fetchText(INVIDIOUS_UPSTREAM);
  if (!invidiousText) {
    errors.push(INVIDIOUS_UPSTREAM);
  } else {
    discoveredInvidious = parseInvidiousInstances(invidiousText, tmp);
  }

  const merged = mergeInstances(state.instances, [...discoveredPiped, ...discoveredInvidious], BUNDLED_INSTANCES);
  const refreshed = discoveredPiped.length + discoveredInvidious.length > 0;
  if (refreshed) {
    await persistState({ instances: merged, lastUpdated: tmp });
  } else {
    await persistState({ instances: state.instances, lastUpdated: state.lastUpdated });
  }

  return { refreshed, discovered: { piped: discoveredPiped.length, invidious: discoveredInvidious.length }, errors };
}

async function lastInstancesUpdate(tmp = Date.now()): Promise<number> {
  const state = await loadState();
  return state.lastUpdated ?? 0;
}

/**
 * Public entry point used by screens: refresh on schedule, otherwise guarantee
 * a seeded registry. Fire-and-forget friendly (never rejects).
 */
export async function warmApiHub(tmp = Date.now()): Promise<RefreshSummary | null> {
  const last = await lastInstancesUpdate(tmp);
  if (Date.now() - last < INSTANCES_STALE_MS) return null;
  return refreshInstancesFromUpstream(tmp);
}

/* ------------------------------------------------------------------ */
/* Re-export pure helpers for consumers                                */
/* ------------------------------------------------------------------ */

export { KEY_COOLDOWN_MS };