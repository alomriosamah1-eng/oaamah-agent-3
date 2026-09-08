// Storage Maintenance — native executor over SQLite / expo-file-system /
// AsyncStorage. All pure constants & formatting live in
// `./storageMaintenance/core` so they stay Node-testable.
//
// SAFETY CONTRACT: only USER-scope data is ever touched. Connection, keys,
// settings, the SQLite schema, flow_keywords and flow_liked are all
// protected (see PROTECTED_ASYNC_KEYS / PROTECTED_TABLES in core).

import { type SQLiteDatabase } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearProfile, loadProfile } from '@/utils/UserProfile';
import { listSavedFiles, savedFilesDir } from '@/utils/savedFiles';
import { getSavedVideos } from '@/utils/flow/flowDB';
import {
  assembleBreakdown,
  isCleanSurfaceSafe,
  USER_ASYNC_KEYS,
  CACHE_ONLY_TABLES,
  RECORDS_TABLES,
} from '@/utils/storageMaintenance/core';
import type { StorageBreakdown, StorageCategoryId, CategoryInput } from '@/utils/storageMaintenance/core';

export type { StorageBreakdown, StorageCategoryId, CategoryInput } from '@/utils/storageMaintenance/core';
export { bytesLabel, freedBytes } from '@/utils/storageMaintenance/core';

const DB_NAME = 'chat.db';

/** Legacy FS recursor — sums the real bytes under a directory. */
async function dirSize(uri: string): Promise<number> {
  let total = 0;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return 0;
    if (info.isDirectory) {
      const entries = await FileSystem.readDirectoryAsync(uri);
      for (const e of entries) total += await dirSize(uri + e);
    } else {
      total += info.size ?? 0;
    }
  } catch {
    /* unreadable → count as 0 */
  }
  return total;
}

/** Removes every entry inside a directory (keeps the directory itself). */
async function emptyDirectory(uri: string): Promise<void> {
  try {
    const entries = await FileSystem.readDirectoryAsync(uri);
    await Promise.all(entries.map((e) => FileSystem.deleteAsync(uri + e, { idempotent: true })));
  } catch {
    /* may not exist — fine */
  }
}

/** Real bytes of chat.db (with its WAL/SHM sidecars) wherever expo-sqlite keeps it. */
async function dbBytes(): Promise<number> {
  const candidates = [
    FileSystem.documentDirectory,
    (FileSystem.documentDirectory ?? '') + 'SQLite/',
  ];
  for (const dir of candidates) {
    const info = await FileSystem.getInfoAsync(dir + DB_NAME);
    if (info.exists) {
      let total = info.size ?? 0;
      for (const sidecar of [`${DB_NAME}-wal`, `${DB_NAME}-shm`]) {
        const s = await FileSystem.getInfoAsync(dir + sidecar);
        if (s.exists) total += s.size ?? 0;
      }
      return total;
    }
  }
  return 0;
}

async function count(db: SQLiteDatabase, table: string): Promise<number> {
  try {
    const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

/** Approx content bytes for the records category (real chars on disk). */
async function recordsBytes(db: SQLiteDatabase): Promise<number> {
  try {
    const hist = await db.getFirstAsync<{ n: number }>(
      `SELECT COALESCE(SUM(LENGTH(user_request || generated_prompt)), 0) AS n FROM prompt_maker_history`
    );
    return (hist?.n ?? 0) + (await count(db, 'flow_history')) * 40;
  } catch {
    return (await count(db, 'flow_history')) * 40;
  }
}

/** UTF-8 byte length (RN-safe — no Buffer on device). */
function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0xd800 || code > 0xdfff) bytes += 3;
    else {
      bytes += 4;
      i += 1;
    }
  }
  return bytes;
}

async function profileInfo(): Promise<{ bytes: number; count: number }> {
  try {
    const p = await loadProfile();
    const raw = JSON.stringify(p);
    return { bytes: utf8ByteLength(raw), count: raw.length > 12 ? 1 : 0 };
  } catch {
    return { bytes: 0, count: 0 };
  }
}

async function cacheBytesAndFiles(): Promise<{ bytes: number; files: number }> {
  const bytes = await dirSize(FileSystem.cacheDirectory ?? '');
  let files = 0;
  try {
    const entries = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory ?? '');
    files = entries.length;
  } catch {
    /* ignore */
  }
  return { bytes, files };
}

/** Real per-category footprint. */
export async function computeStorageBreakdown(db: SQLiteDatabase): Promise<StorageBreakdown> {
  const [chats, messages, promptMessages, videosCount, savedFilesCount, cacheInfo, prof, recBytes] =
    await Promise.all([
      count(db, 'chats'),
      count(db, 'messages'),
      count(db, 'prompt_messages'),
      count(db, 'flow_saved'),
      listSavedFiles().then((l) => l.length),
      cacheBytesAndFiles(),
      profileInfo(),
      recordsBytes(db),
    ]);

  const input: Partial<Record<StorageCategoryId, CategoryInput>> = {
    knowledge: { bytes: await dbBytes(), count: chats + messages + promptMessages },
    records: { bytes: recBytes, count: (await count(db, 'prompt_maker_history')) + (await count(db, 'flow_history')) },
    videos: { bytes: await dirSize((FileSystem.documentDirectory ?? '') + 'flow/'), count: videosCount },
    saved: { bytes: await dirSize(savedFilesDir().uri), count: savedFilesCount },
    profile: { bytes: prof.bytes, count: prof.count },
    cache: { bytes: cacheInfo.bytes, count: cacheInfo.files },
  };
  return assembleBreakdown(input);
}

async function runSql(db: SQLiteDatabase, sql: string): Promise<void> {
  try {
    await db.execAsync(sql);
  } catch {
    /* isolated — never blocks the rest */
  }
}

/** Compact the DB file so "freed space" shows for real. Schema untouched. */
async function compactDb(db: SQLiteDatabase): Promise<void> {
  try {
    await db.execAsync('VACUUM');
  } catch {
    /* in-use/unsupported — non-fatal */
  }
}

/* ------------------------------------------------------------------ */
/* Per-category cleaners                                               */
/* ------------------------------------------------------------------ */

/** Temp cache: cache dir + document temp jpgs + self-healing cache tables. */
export async function cleanTemp(db: SQLiteDatabase): Promise<void> {
  await Promise.all([
    emptyDirectory(FileSystem.cacheDirectory ?? ''),
    (async () => {
      try {
        const entries = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory ?? '');
        await Promise.all(
          entries
            .filter((e) => /^\d+\.jpg$/.test(e))
            .map((e) => FileSystem.deleteAsync((FileSystem.documentDirectory ?? '') + e, { idempotent: true }))
        );
      } catch {
        /* ignore */
      }
    })(),
  ]);
  for (const t of CACHE_ONLY_TABLES) await runSql(db, `DELETE FROM ${t}`);
}

/** Second brain & knowledge: conversations + prompt-maker sessions. */
export async function clearKnowledge(db: SQLiteDatabase): Promise<void> {
  await runSql(db, 'DELETE FROM messages');
  await runSql(db, 'DELETE FROM chats');
  await runSql(db, 'DELETE FROM prompt_messages');
  await runSql(db, 'DELETE FROM prompt_sessions');
  await compactDb(db);
}

/** Records: prompt-maker history + FLOW interaction log. */
export async function clearRecords(db: SQLiteDatabase): Promise<void> {
  for (const t of RECORDS_TABLES) await runSql(db, `DELETE FROM ${t}`);
  await compactDb(db);
}

/** Offline videos: on-disk MP4s + flow_saved registry. */
export async function clearSavedVideos(db: SQLiteDatabase): Promise<void> {
  const rows = await getSavedVideos(db).catch(() => []);
  await Promise.all(
    rows.map((r) => FileSystem.deleteAsync(r.localUri, { idempotent: true }).catch(() => {}))
  );
  await runSql(db, 'DELETE FROM flow_saved');
}

/** Saved files (PDFs / images): on-disk artifacts + AsyncStorage registry. */
export async function clearSavedFiles(): Promise<void> {
  try {
    const dir = savedFilesDir();
    await emptyDirectory(dir.uri);
  } catch {
    /* ignore */
  }
  try {
    const list = await listSavedFiles();
    await Promise.all(
      list.map((f) => FileSystem.deleteAsync(f.uri, { idempotent: true }).catch(() => {}))
    );
  } catch {
    /* best effort */
  }
  await AsyncStorage.removeItem(USER_ASYNC_KEYS[1]);
}

/** User profile only (osamah:userProfile). */
export async function clearProfileData(): Promise<void> {
  await clearProfile();
}

/* ------------------------------------------------------------------ */
/* Factory reset — user scope only. Settings/keys/connection survive.  */
/* ------------------------------------------------------------------ */

/** Runs every user-scope cleaner; returns before/after breakdowns. */
export async function factoryReset(db: SQLiteDatabase): Promise<{ before: StorageBreakdown; after: StorageBreakdown }> {
  if (!isCleanSurfaceSafe()) {
    throw new Error('storage-maintenance: clean surface collides with protected boundary — aborted');
  }
  const before = await computeStorageBreakdown(db);
  await cleanTemp(db);
  await clearKnowledge(db);
  await clearRecords(db);
  await clearSavedVideos(db);
  await clearSavedFiles();
  await clearProfileData();
  const after = await computeStorageBreakdown(db);
  return { before, after };
}