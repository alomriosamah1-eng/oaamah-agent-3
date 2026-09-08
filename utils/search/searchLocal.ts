// Local deep-search engine for the in-app search. Read-only: walks every
// content table (chat histories, second-brain prompt sessions, prompt-maker
// history, FLOW cached/liked/saved videos) and returns unified hits that the
// search screen renders as tappable cards. Pure data access — no UI.

import { type SQLiteDatabase } from 'expo-sqlite';

export type SearchHitType = 'chat' | 'video' | 'prompt';

export interface SearchHit {
  type: SearchHitType;
  /** Local row id — chatId for chats, session/history id for prompts. */
  id?: number;
  /** YouTube id — present only for video hits, used to open FLOW. */
  ytId?: string;
  title: string;
  channel?: string;
  thumb?: string;
  duration?: number;
  /** Short matched excerpt shown under the title. */
  preview: string;
  /** Extra badge label, e.g. «محمّل» / «إعجاب». */
  badge?: string;
}

const MAX_CHATS = 12;
const MAX_VIDEOS = 20;
const MAX_PROMPTS = 12;

function escLike(q: string): string {
  return q.replace(/[\\%_]/g, '\\$&');
}

function squish(s: string, n = 140): string {
  const clean = (s ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= n) return clean;
  return clean.slice(0, n - 1) + '…';
}

/* ------------------------------------------------------------------ */
/* Chat history                                                        */
/* ------------------------------------------------------------------ */

async function searchChats(db: SQLiteDatabase, term: string, hits: SearchHit[]) {
  const like = `%${escLike(term)}%`;
  const added = new Set<number>();

  // Title matches — one compact card per conversation.
  const byTitle = await db.getAllAsync<{ id: number; title: string }>(
    `SELECT id, title FROM chats WHERE title LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT ${MAX_CHATS}`,
    like
  );
  for (const c of byTitle) {
    if (added.has(c.id)) continue;
    added.add(c.id);
    hits.push({
      type: 'chat',
      id: c.id,
      title: c.title,
      preview: c.title,
    });
  }

  // Message-content matches — group by chat, snapshot the first match.
  const byMsg = await db.getAllAsync<{ chat_id: number; title: string; content: string }>(
    `SELECT m.chat_id, c.title, m.content
       FROM messages m
       JOIN chats c ON c.id = m.chat_id
      WHERE m.content LIKE ? ESCAPE '\\'
      ORDER BY m.id DESC
      LIMIT ${MAX_CHATS * 4}`,
    like
  );
  for (const m of byMsg) {
    if (added.has(m.chat_id)) continue;
    if (hits.filter((h) => h.type === 'chat').length >= MAX_CHATS) break;
    added.add(m.chat_id);
    hits.push({
      type: 'chat',
      id: m.chat_id,
      title: m.title,
      preview: squish(m.content),
    });
  }
}

/* ------------------------------------------------------------------ */
/* Second brain: prompt sessions + prompt-maker history                */
/* ------------------------------------------------------------------ */

async function searchPromptSessions(db: SQLiteDatabase, term: string, hits: SearchHit[]) {
  const like = `%${escLike(term)}%`;
  const added = new Set<number>();

  try {
    const byTitle = await db.getAllAsync<{ id: number; title: string }>(
      `SELECT id, title FROM prompt_sessions WHERE title LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT ${MAX_PROMPTS}`,
      like
    );
    for (const s of byTitle) {
      if (added.has(s.id)) continue;
      added.add(s.id);
      hits.push({ type: 'prompt', id: s.id, title: s.title, preview: s.title, badge: 'prompt' });
    }
  } catch {
    // prompt_sessions may not exist yet — skip
  }

  try {
    const byMsg = await db.getAllAsync<{ session_id: number; title: string; content: string }>(
      `SELECT pm.session_id, ps.title, pm.content
         FROM prompt_messages pm
         JOIN prompt_sessions ps ON ps.id = pm.session_id
        WHERE pm.content LIKE ? ESCAPE '\\'
        ORDER BY pm.id DESC
        LIMIT ${MAX_PROMPTS * 4}`,
      like
    );
    for (const m of byMsg) {
      if (added.has(m.session_id)) continue;
      if (hits.filter((h) => h.type === 'prompt').length >= MAX_PROMPTS * 2) break;
      added.add(m.session_id);
      hits.push({ type: 'prompt', id: m.session_id, title: m.title, preview: squish(m.content), badge: 'prompt' });
    }
  } catch {
    // prompt_messages may not exist yet — skip
  }
}

async function searchPromptMaker(db: SQLiteDatabase, term: string, hits: SearchHit[]) {
  const like = `%${escLike(term)}%`;
  try {
    const rows = await db.getAllAsync<{ id: number; title: string; user_request: string; generated_prompt: string }>(
      `SELECT id, title, user_request AS user_request, generated_prompt AS generated_prompt
         FROM prompt_maker_history
        WHERE title LIKE ? ESCAPE '\\' OR user_request LIKE ? ESCAPE '\\' OR generated_prompt LIKE ? ESCAPE '\\'
        ORDER BY created_at DESC
        LIMIT ${MAX_PROMPTS}`,
      like,
      like,
      like
    );
    for (const r of rows) {
      const preview = squish(r.user_request || r.generated_prompt);
      hits.push({ type: 'prompt', id: r.id, title: r.title, preview, badge: 'prompt' });
    }
  } catch {
    // prompt_maker_history is lazy-created — skip when absent
  }
}

/* ------------------------------------------------------------------ */
/* FLOW videos: cached feed + liked + offline saves                    */
/* ------------------------------------------------------------------ */

async function searchVideos(db: SQLiteDatabase, term: string, hits: SearchHit[]) {
  const like = `%${escLike(term)}%`;
  const added = new Set<string>();
  const pushVideo = (v: {
    ytId: string;
    title: string;
    channel: string;
    thumb: string;
    duration: number;
    badge?: string;
  }) => {
    if (!v.ytId || !v.title || added.has(v.ytId)) return;
    if (hits.filter((h) => h.type === 'video').length >= MAX_VIDEOS) return;
    added.add(v.ytId);
    hits.push({
      type: 'video',
      ytId: v.ytId,
      title: v.title,
      channel: v.channel,
      thumb: v.thumb,
      duration: v.duration,
      preview: v.channel,
      badge: v.badge,
    });
  };

  try {
      const cacheRows = await db.getAllAsync<{ ytId: string; title: string; channel: string; thumb: string; duration: number }>(
    `SELECT yt_id AS ytId, title, channel, thumb, duration
       FROM flow_feed_cache
      WHERE title LIKE ? ESCAPE '\\' OR channel LIKE ? ESCAPE '\\'
      ORDER BY fetched_at DESC
      LIMIT ${MAX_VIDEOS * 3}`,
    like,
    like
  );
  for (const v of cacheRows) pushVideo({ ...v });
    } catch { /* cache read failed — still try saved */ }

    try {
      const likedRows = await db.getAllAsync<{ ytId: string; title: string; channel: string; thumb: string; duration: number }>(
    `SELECT f.yt_id AS ytId, c.title, c.channel, c.thumb, c.duration
       FROM flow_liked f
       JOIN flow_feed_cache c ON c.yt_id = f.yt_id
      WHERE c.title LIKE ? ESCAPE '\\' OR c.channel LIKE ? ESCAPE '\\'
      ORDER BY f.added_at DESC
      LIMIT ${MAX_VIDEOS * 3}`,
    like,
    like
  );
  for (const v of likedRows) pushVideo({ ...v, badge: 'liked' });
    } catch { /* liked read failed */ }

    try {
      const savedRows = await db.getAllAsync<{ ytId: string; title: string; channel: string; thumb: string; duration: number }>(
    `SELECT yt_id AS ytId, title, channel, thumb, duration
       FROM flow_saved
      WHERE title LIKE ? ESCAPE '\\' OR channel LIKE ? ESCAPE '\\'
      ORDER BY added_at DESC
      LIMIT ${MAX_VIDEOS * 3}`,
    like,
    like
  );
  for (const v of savedRows) pushVideo({ ...v, badge: 'saved' });
    } catch { /* saved read failed */ }
}

/* ------------------------------------------------------------------ */
/* Public: run every source, return grouped, deduped hits              */
/* ------------------------------------------------------------------ */

export async function searchLocalContent(db: SQLiteDatabase, query: string): Promise<SearchHit[]> {
  const q = (query ?? '').trim();
  if (!q) return [];

  const hits: SearchHit[] = [];
  await Promise.all([
    searchChats(db, q, hits),
    searchPromptSessions(db, q, hits),
    searchPromptMaker(db, q, hits),
    searchVideos(db, q, hits),
  ]);

  const order: Record<SearchHitType, number> = { chat: 0, video: 1, prompt: 2 };
  return hits.sort((a, b) => order[a.type] - order[b.type]);
}