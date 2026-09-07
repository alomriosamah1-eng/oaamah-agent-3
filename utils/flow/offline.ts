// Offline watch: downloads the resolved MP4 to device storage and tracks it
// in SQLite so the reel is playable with zero connection.
import * as FileSystem from 'expo-file-system/legacy';
import { type SQLiteDatabase } from 'expo-sqlite';
import {
  addSavedVideo,
  getSavedVideos,
  removeSavedVideo,
  type SavedVideo,
} from '@/utils/flow/flowDB';
import type { FlowVideo } from '@/utils/flow/youtubeClient';
import type { ResolvedStream, StreamQuality } from '@/utils/flow/streamResolver';

const FLOW_DIR = 'flow/';
export const MAX_OFFLINE_BYTES = 500 * 1024 * 1024; // 500 MB

export async function downloadForOffline(
  db: SQLiteDatabase,
  video: FlowVideo,
  stream: ResolvedStream,
  quality: StreamQuality
): Promise<SavedVideo | null> {
  try {
    if (stream.contentType === 'hls') return null; // cannot persist HLS segments simply
    const dir = FileSystem.documentDirectory + FLOW_DIR;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

    const dest = `${dir}${video.ytId}.mp4`;
    const res = await FileSystem.downloadAsync(stream.url, dest);
    if (res.status !== 200) return null;

    const info = await FileSystem.getInfoAsync(dest);
    const size = info.exists ? (info.size ?? 0) : 0;

    const saved: SavedVideo = {
      id: 0,
      ytId: video.ytId,
      title: video.title,
      channel: video.channel,
      thumb: video.thumb,
      localUri: dest,
      quality,
      size,
      addedAt: Date.now(),
    };
    await addSavedVideo(db, saved);
    await evictIfOverCap(db);
    return saved;
  } catch {
    return null;
  }
}

export async function deleteOffline(db: SQLiteDatabase, ytId: string): Promise<void> {
  const row = await getSavedVideos(db);
  const target = row.find((s) => s.ytId === ytId);
  if (target) {
    try {
      await FileSystem.deleteAsync(target.localUri, { idempotent: true });
    } catch {
      // ignore missing file
    }
  }
  await removeSavedVideo(db, ytId);
}

async function evictIfOverCap(db: SQLiteDatabase): Promise<void> {
  const saved = await getSavedVideos(db);
  const total = saved.reduce((sum, s) => sum + (s.size || 0), 0);
  if (total <= MAX_OFFLINE_BYTES) return;

  // Remove oldest (already sorted newest-first) until under the cap.
  for (const item of saved.reverse()) {
    // keep at least one reel
    const remaining = await getSavedVideos(db);
    if (remaining.length <= 1) break;
    await deleteOffline(db, item.ytId);
    const now = await getSavedVideos(db);
    if (now.reduce((s, x) => s + (x.size || 0), 0) <= MAX_OFFLINE_BYTES) break;
  }
}