// Saved Files — a lightweight registry of agent-created artifacts.
//
// This is a FRONTEND-ONLY layer. It does not touch the opencode server, the
// chat database or the voice gateway. It records the real files the agent
// actually produced on-device:
//
//   - PDF exports (generated via expo-print and shared from a chat), moved
//     into a persistent app directory so they survive the OS cache purge, and
//   - generated images saved by the user from the image viewer (copied into
//     the same directory), plus generated images still referenced by the
//     local message database (imageUrl rows).
//
// The registry lives in AsyncStorage (a plain JSON list) so it can be wired
// to a real server-backed documents API later without changing call sites.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

export type SavedFileKind = 'pdf' | 'image';

export interface SavedFileRef {
  id: string;
  kind: SavedFileKind;
  name: string;
  uri: string;
  /** Bytes on disk (PDF only — images read it from the file live). */
  size?: number;
  createdAt: number;
  /** Source chat id, when the artifact came from a chat message. */
  chatId?: number;
  /** Companion print HTML (in-app reader preview), as a local file uri. */
  previewHtml?: string;
}

const SAVED_FILES_KEY = 'osamah:savedFiles';
const SAVED_FILES_DIR = 'saved-files';

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The persistent directory where agent artifacts are copied. */
export function savedFilesDir(): Directory {
  const dir = new Directory(Paths.document, SAVED_FILES_DIR);
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

export async function listSavedFiles(): Promise<SavedFileRef[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_FILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedFileRef[]) : [];
  } catch {
    return [];
  }
}

async function persist(list: SavedFileRef[]): Promise<void> {
  await AsyncStorage.setItem(SAVED_FILES_KEY, JSON.stringify(list));
}

/** Copy a file (PDF export, downloaded image) into the app's persistent
 *  saved-files directory and register it. Returns the stored reference. */
export async function addSavedFile(
  sourceUri: string,
  name: string,
  kind: SavedFileKind,
  meta: { size?: number; chatId?: number; previewHtml?: string } = {}
): Promise<SavedFileRef> {
  const dir = savedFilesDir();
  const safe = name.replace(/[^\w.\-() ]+/g, '_').trim() || `artifact-${newId()}`;
  const dest = new File(dir, safe);
  if (dest.exists) dest.delete();
  try {
    const src = new File(sourceUri);
    if (src.exists) src.copy(dest);
  } catch {
    // If the copy fails (e.g. the source is a network URL), keep the source
    // URI as-is so the file is still reachable while it exists.
  }
  let previewHtml: string | undefined;
  if (meta.previewHtml) {
    const previewFile = new File(dir, `${safe}.preview.html`);
    if (previewFile.exists) previewFile.delete();
    try {
      previewFile.write(meta.previewHtml);
      previewHtml = previewFile.uri;
    } catch {
      // reader preview is best-effort — the PDF itself still works
    }
  }
  const ref: SavedFileRef = {
    id: newId(),
    kind,
    name: safe,
    uri: safe ? dest.uri : sourceUri,
    size: meta.size,
    createdAt: Date.now(),
    chatId: meta.chatId,
    previewHtml,
  };
  const list = await listSavedFiles();
  list.unshift(ref);
  await persist(list);
  return ref;
}

export async function removeSavedFile(id: string): Promise<void> {
  const list = await listSavedFiles();
  const next = list.filter((f) => f.id !== id);
  if (next.length === list.length) return;
  const removed = list.find((f) => f.id === id);
  if (removed) {
    try {
      const file = new File(removed.uri);
      if (file.exists) file.delete();
    } catch {
      // best effort — the registry entry is still removed
    }
    if (removed.previewHtml) {
      try {
        const preview = new File(removed.previewHtml);
        if (preview.exists) preview.delete();
      } catch {
        // best effort
      }
    }
  }
  await persist(next);
}

/** Returns the current on-disk size of a saved file's uri, or 0. */
export function fileSizeOf(uri: string): number {
  try {
    const f = new File(uri);
    return f.size ?? 0;
  } catch {
    return 0;
  }
}