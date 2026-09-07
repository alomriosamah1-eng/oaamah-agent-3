// OSAMAH API HUB — pure core (no RN / Expo imports → Node-testable).
//
// Everything here is deterministic business logic for the auto-switch +
// auto-update system: key rotation, provider failover, upstream instance-list
// parsing and merging, and health bookkeeping. The React-Native-facing side
// lives in `store.ts` and re-exports these helpers.

export type ApiCategory =
  | 'ai'
  | 'voice'
  | 'social'
  | 'search'
  | 'maps'
  | 'media'
  | 'automation'
  | 'opendata';

export interface CatalogEntry {
  /** Stable unique id. */
  id: string;
  name: string;
  category: ApiCategory;
  baseUrl: string;
  /** auth a consumer needs to supply. */
  auth: 'none' | 'key' | 'oauth';
  /** Example endpoint path (relative to baseUrl). */
  endpoint?: string;
  docs?: string;
  /** Lower = tried first within the category. */
  priority: number;
  note?: string;
}

export type InstanceKind = 'piped' | 'invidious' | string;

export interface ExternalInstance {
  id: string;
  kind: InstanceKind;
  baseUrl: string;
  healthy: boolean;
  latencyMs?: number;
  source: 'bundled' | 'discovered' | 'user';
  lastChecked?: number;
  consecutiveFails?: number;
}

export interface KeyEntry {
  id: string;
  service: string;
  value: string;
  source: 'config' | 'user';
  addedAt: number;
}

/* ------------------------------------------------------------------ */
/* Key chain                                                            */
/* ------------------------------------------------------------------ */

/**
 * Normalize any mix of single-key / array / undefined inputs into a de-duped
 * non-empty chain. Config keys keep their order first, user keys are appended
 * after, so baked-in keys stay primary while user keys extend capacity.
 */
export function normalizeKeyChain(
  configValues: Array<string | undefined>,
  userValues: Array<string | undefined> = [],
  knownService?: string,
): KeyEntry[] {
  const seen = new Set<string>();
  const out: KeyEntry[] = [];
  const now = Date.now();

  const push = (value: string | undefined, source: 'config' | 'user') => {
    const v = (value ?? '').trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push({ id: `${source}-${v.slice(-6)}-${out.length}`, service: knownService ?? '', value: v, source, addedAt: now });
  };

  for (const v of configValues) push(v, 'config');
  for (const v of userValues) push(v, 'user');
  return out;
}

export interface KeyCursor {
  values: KeyEntry[];
  cooldownUntil: Map<string, number>;
  cursor: number;
}

export function createKeyCursor(entries: KeyEntry[], now = Date.now()): KeyCursor {
  return { values: entries, cooldownUntil: new Map(), cursor: 0 };
}

/** Next usable key with round-robin; skips cooled-down ones. If all are cooled, retry is allowed. */
export function nextKey(
  cursor: KeyCursor,
  now = Date.now(),
  cooldownMs = 5 * 60_000,
): { key: KeyEntry; index: number } | null {
  if (cursor.values.length === 0) return null;

  let attempts = cursor.values.length;
  let i = cursor.cursor;
  while (attempts > 0) {
    const entry = cursor.values[i];
    if ((cursor.cooldownUntil.get(entry.id) ?? 0) <= now) {
      cursor.cursor = (i + 1) % cursor.values.length;
      return { key: entry, index: i };
    }
    i = (i + 1) % cursor.values.length;
    attempts -= 1;
  }

  // Every key is cooled down — allow the full chain again after a full cycle.
  const fallback = cursor.values[cursor.cursor];
  cursor.cursor = (cursor.cursor + 1) % cursor.values.length;
  return fallback ? { key: fallback, index: (cursor.cursor + cursor.values.length - 1) % cursor.values.length } : null;
}

export function penalizeKey(cursor: KeyCursor, keyId: string, now = Date.now(), cooldownMs = 5 * 60_000): void {
  cursor.cooldownUntil.set(keyId, now + cooldownMs);
}

export function keyIds(cursor: KeyCursor): string[] {
  return cursor.values.map((k) => k.id);
}

/** Are the key values identical to the previous slot (used to drop user-dupes)? */
export function hasKey(cursor: KeyCursor, value: string): boolean {
  const v = value.trim();
  return cursor.values.some((k) => k.value === v);
}

/* ------------------------------------------------------------------ */
/* Failover engine                                                      */
/* ------------------------------------------------------------------ */

export interface FailoverResult<T> {
  ok: boolean;
  value?: T;
  error?: unknown;
  /** The candidate that finally succeeded (or `undefined` when all failed). */
  used?: string;
  attempts: number;
}

/**
 * Try `candidates` in order, calling `attempt(candidate, index)`. The first
 * that resolves wins; failures are reported via `onResult` so the caller can
 * book-keep health/cooldown. Never throws — last error is returned.
 */
export async function runWithFailover<T>(
  candidates: Array<string | null>,
  attempt: (candidate: string, index: number) => Promise<T>,
  onResult?: (candidate: string, ok: boolean, index: number) => void,
): Promise<FailoverResult<T>> {
  let lastError: unknown = null;
  let attempts = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!candidate) continue;
    attempts += 1;
    try {
      const value = await attempt(candidate, i);
      onResult?.(candidate, true, i);
      return { ok: true, value, used: candidate, attempts };
    } catch (err) {
      lastError = err;
      onResult?.(candidate, false, i);
    }
  }
  return { ok: false, error: lastError, attempts };
}

/** Simple short-circuit helper: first non-null build that isn't empty. */
export function firstNonEmpty<T>(values: Array<T | null | undefined>): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) return v;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Upstream instance-list parsing                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse the Invidious instance list (`https://api.invidious.io/instances.json`):
 * `[["host", {uri?, api?, type?, monitor?}], ...]`. Only usable https entries survive.
 */
export function parseInvidiousInstances(rawText: string, now = Date.now()): ExternalInstance[] {
  try {
    const data = JSON.parse(rawText);
    if (!Array.isArray(data)) return [];
    const out: ExternalInstance[] = [];
    for (const entry of data) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const meta: { uri?: string; api?: string } | null =
        entry[1] && typeof entry[1] === 'object' ? entry[1] : null;
      if (!meta) continue;
      const url = (meta.uri || meta.api || '').trim().replace(/\/+$/, '');
      if (!isHttpsUrl(url)) continue;
      out.push({
        id: `invidious-${entry[0]}`,
        kind: 'invidious',
        baseUrl: url,
        healthy: true,
        source: 'discovered',
        lastChecked: now,
        consecutiveFails: 0,
      });
    }
    return dedupeInstances(out);
  } catch {
    return [];
  }
}

/**
 * Parse a Piped instance list. Accepts several shapes found across mirrors:
 * - `"https://...", "https://..."` (bare strings/hosts)
 * - `[{ "api_url": "https://...", "name": "..." }, ...]`
 * - `{ "instances": [...] }` wrappers
 */
export function parsePipedInstances(rawText: string, now = Date.now()): ExternalInstance[] {
  try {
    const data = JSON.parse(rawText);
    const list = Array.isArray(data)
      ? data
      : Array.isArray((data as any)?.instances)
        ? (data as any).instances
        : Array.isArray((data as any)?.data)
          ? (data as any).data
          : null;
    if (!Array.isArray(list)) return [];

    const out: ExternalInstance[] = [];
    for (const item of list) {
      if (typeof item === 'string') {
        const url = normalizeHost(item);
        if (!isHttpsUrl(url)) continue;
        out.push(toPiped(url, url, now));
        continue;
      }
      if (item && typeof item === 'object') {
        const apiUrl = (item.api_url || item.url || item.host || '') as string;
        const url = normalizeHost(apiUrl);
        if (!isHttpsUrl(url)) continue;
        const name = (item.name ?? '') as string;
        out.push(toPiped(name ? `piped-${name}` : url, url, now));
      }
    }
    return dedupeInstances(out);
  } catch {
    return [];
  }
}

function toPiped(id: string, baseUrl: string, now: number): ExternalInstance {
  return {
    id: `piped-${id}`,
    kind: 'piped',
    baseUrl,
    healthy: true,
    source: 'discovered',
    lastChecked: now,
    consecutiveFails: 0,
  };
}

function normalizeHost(value: string): string {
  const v = (value ?? '').trim();
  if (!v) return '';
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return withProto.replace(/\/+$/, '');
}

function isHttpsUrl(value: string): boolean {
  return /^https:\/\/[a-zA-Z0-9.-]+(?:[:\d]*)?(?:\/|$)/i.test(value) && !value.includes('{') && !value.includes(' ');
}

/* ------------------------------------------------------------------ */
/* Instance registry: merge / order / health                            */
/* ------------------------------------------------------------------ */

export interface InstanceState {
  instances: ExternalInstance[];
  lastUpdated: number;
}

export const DEFAULT_STATE: InstanceState = { instances: [], lastUpdated: 0 };

/**
 * Merge a freshly discovered list into the previous state. Rules:
 * - user-added instances are always preserved (and re-merged by baseUrl);
 * - healthy discovered instances from the fresh list replace stored ones with
 *   the same baseUrl (health/latency refreshed);
 * - if `fresh` is empty the previous list is kept intact (seed = fallback);
 * - dedupe by baseUrl, keep at most `maxPerKind` per kind.
 */
export function mergeInstances(
  prev: ExternalInstance[],
  fresh: ExternalInstance[],
  seed: ExternalInstance[] = [],
  maxPerKind = 10,
): ExternalInstance[] {
  const byUrl = new Map<string, ExternalInstance>();
  const add = (inst: ExternalInstance) => {
    const url = (inst.baseUrl || '').trim().replace(/\/+$/, '');
    if (!url || !isHttpsUrl(url)) return;
    if (inst.source === 'user' && byUrl.has(url)) return;
    byUrl.set(url, inst);
  };

  // User-added first (always preserved).
  for (const inst of prev) if (inst.source === 'user') add(inst);
  // Fresh discovered (refreshed health).
  for (const inst of fresh) add(inst);
  // Previous non-user (kept when fresh had nothing for that url).
  for (const inst of prev) if (inst.source !== 'user') add(inst);
  // Bundled seeds only fill gaps (empty prev + empty fresh).
  if (byUrl.size === 0) for (const inst of seed) add(inst);

  const grouped = new Map<InstanceKind, ExternalInstance[]>();
  for (const inst of byUrl.values()) {
    const list = grouped.get(inst.kind) ?? [];
    list.push(inst);
    grouped.set(inst.kind, list);
  }
  const out: ExternalInstance[] = [];
  for (const list of grouped.values()) {
    const sorted = sortInstances(list);
    out.push(...sorted.slice(0, maxPerKind));
  }
  return out;
}

/** Deterministic candidate order: healthy → low latency → user/discovered before bundled. */
export function sortInstances(list: ExternalInstance[]): ExternalInstance[] {
  const score = (i: ExternalInstance): string => {
    const health = i.healthy ? '0' : '1';
    const latency = i.latencyMs != null && i.latencyMs < 5000 ? String(i.latencyMs).padStart(6, '0') : '999999';
    const source = i.source === 'user' ? '0' : i.source === 'discovered' ? '1' : '2';
    const fails = Math.min(i.consecutiveFails ?? 0, 99).toString().padStart(2, '0');
    return `${health}${source}${latency}${fails}`;
  };
  return [...list].sort((a, b) => (score(a) < score(b) ? -1 : score(a) > score(b) ? 1 : 0));
}

/** Ordered list of base URLs for a kind, ready to feed runWithFailover. */
export function buildCandidateOrder(instances: ExternalInstance[], kind: InstanceKind): string[] {
  return sortInstances(instances.filter((i) => i.kind === kind)).map((i) => i.baseUrl);
}

const MAX_FAILS = 3;

/**
 * Record an attempt outcome. Consecutive failures (>= 3) flag the instance
 * unhealthy so ordering pushes it to the back; a single success restores it.
 */
export function markAttempt(
  instances: ExternalInstance[],
  baseUrl: string,
  ok: boolean,
  now = Date.now(),
): ExternalInstance[] {
  const url = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!url) return instances;
  return instances.map((inst) => {
    if ((inst.baseUrl || '').trim().replace(/\/+$/, '') !== url) return inst;
    const fails = ok ? 0 : (inst.consecutiveFails ?? 0) + 1;
    return {
      ...inst,
      healthy: ok || fails < MAX_FAILS,
      consecutiveFails: fails,
      lastChecked: now,
    };
  });
}

function dedupeInstances(list: ExternalInstance[]): ExternalInstance[] {
  const seen = new Set<string>();
  const out: ExternalInstance[] = [];
  for (const inst of list) {
    const url = (inst.baseUrl || '').trim().replace(/\/+$/, '');
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(inst);
  }
  return out;
}

/** Extract `config`-sourced key values (used before rotation cycles matter). */
export function configKeyValues(entries: KeyEntry[]): string[] {
  return entries.filter((k) => k.source === 'config').map((k) => k.value);
}