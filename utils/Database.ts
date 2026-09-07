import { Chat, Message, Role } from '@/utils/Interfaces';
import { type SQLiteDatabase } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  // Log DB path for debugging
  // console.log(FileSystem.documentDirectory);
  const DATABASE_VERSION = 6;
  let result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');

  let currentDbVersion = result?.user_version ?? 0;

  if (currentDbVersion >= DATABASE_VERSION) {
    return;
  }
  if (currentDbVersion === 0) {
    const result = await db.execAsync(`
PRAGMA journal_mode = 'wal';
CREATE TABLE chats (
  id INTEGER PRIMARY KEY NOT NULL, 
  title TEXT NOT NULL
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY NOT NULL, 
  chat_id INTEGER NOT NULL, 
  content TEXT NOT NULL, 
  imageUrl TEXT, 
  role TEXT, 
  prompt TEXT, 
  FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
);
`);

    currentDbVersion = 1;
  }
  if (currentDbVersion === 1) {
    await db.execAsync(`
CREATE TABLE prompt_sessions (
  id INTEGER PRIMARY KEY NOT NULL,
  title TEXT NOT NULL
);

CREATE TABLE prompt_messages (
  id INTEGER PRIMARY KEY NOT NULL,
  session_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  role TEXT,
  FOREIGN KEY (session_id) REFERENCES prompt_sessions (id) ON DELETE CASCADE
);
`);

    currentDbVersion = 2;
  }
  if (currentDbVersion === 2) {
    await db.execAsync(`
ALTER TABLE prompt_sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
`);

    currentDbVersion = 3;
  }
  if (currentDbVersion === 3) {
    await db.execAsync(`
CREATE TABLE IF NOT EXISTS flow_keywords (
  id INTEGER PRIMARY KEY NOT NULL,
  text TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'agent',
  active INTEGER NOT NULL DEFAULT 1,
  weight INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_feed_cache (
  id INTEGER PRIMARY KEY NOT NULL,
  yt_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  channel TEXT NOT NULL,
  channel_id TEXT,
  thumb TEXT,
  duration INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  published_at INTEGER NOT NULL DEFAULT 0,
  lang TEXT NOT NULL DEFAULT 'ar',
  fetched_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_stream_cache (
  id INTEGER PRIMARY KEY NOT NULL,
  yt_id TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  quality TEXT NOT NULL,
  backend TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_saved (
  id INTEGER PRIMARY KEY NOT NULL,
  yt_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  channel TEXT NOT NULL,
  thumb TEXT,
  local_uri TEXT NOT NULL,
  quality TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_history (
  id INTEGER PRIMARY KEY NOT NULL,
  yt_id TEXT NOT NULL,
  action TEXT NOT NULL,
  keyword_at_view TEXT,
  at INTEGER NOT NULL
);
`);

    currentDbVersion = 4;
  }
  if (currentDbVersion === 4) {
    await db.execAsync(`
CREATE TABLE IF NOT EXISTS flow_liked (
  id INTEGER PRIMARY KEY NOT NULL,
  yt_id TEXT NOT NULL UNIQUE,
  added_at INTEGER NOT NULL
);
`);

    currentDbVersion = 5;
  }
  if (currentDbVersion === 5) {
    // Self-heal: devices already at user_version = 5 (before flow_liked was
    // added to the v4→v5 step without a version bump) skipped that table.
    // Re-assert every FLOW table idempotently so a missing table can never
    // stall the feed again.
    await db.execAsync(`
CREATE TABLE IF NOT EXISTS flow_keywords (
  id INTEGER PRIMARY KEY NOT NULL,
  text TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'agent',
  active INTEGER NOT NULL DEFAULT 1,
  weight INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_feed_cache (
  id INTEGER PRIMARY KEY NOT NULL,
  yt_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  channel TEXT NOT NULL,
  channel_id TEXT,
  thumb TEXT,
  duration INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  published_at INTEGER NOT NULL DEFAULT 0,
  lang TEXT NOT NULL DEFAULT 'ar',
  fetched_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_stream_cache (
  id INTEGER PRIMARY KEY NOT NULL,
  yt_id TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  quality TEXT NOT NULL,
  backend TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_saved (
  id INTEGER PRIMARY KEY NOT NULL,
  yt_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  channel TEXT NOT NULL,
  thumb TEXT,
  local_uri TEXT NOT NULL,
  quality TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_history (
  id INTEGER PRIMARY KEY NOT NULL,
  yt_id TEXT NOT NULL,
  action TEXT NOT NULL,
  keyword_at_view TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_liked (
  id INTEGER PRIMARY KEY NOT NULL,
  yt_id TEXT NOT NULL UNIQUE,
  added_at INTEGER NOT NULL
);
`);

    currentDbVersion = 6;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

export const addChat = async (db: SQLiteDatabase, title: string) => {
  return await db.runAsync('INSERT INTO chats (title) VALUES (?)', title);
};

export const getChats = async (db: SQLiteDatabase) => {
  return await db.getAllAsync('SELECT * FROM chats ORDER BY id DESC');
};

export const getMessages = async (db: SQLiteDatabase, chatId: number): Promise<Message[]> => {
  return (await db.getAllAsync<Message>('SELECT * FROM messages WHERE chat_id = ?', chatId)).map(
    (message) => ({
      ...message,
      role: '' + message.role === 'bot' ? Role.Bot : Role.User,
    })
  );
};

export const addMessage = async (
  db: SQLiteDatabase,
  chatId: number,
  { content, role, imageUrl, prompt }: Message
) => {
  return await db.runAsync(
    'INSERT INTO messages (chat_id, content, role, imageUrl, prompt) VALUES (?, ?, ?, ?, ?)',
    chatId,
    content,
    role === Role.Bot ? 'bot' : 'user',
    imageUrl || '',
    prompt || ''
  );
};

export const deleteChat = async (db: SQLiteDatabase, chatId: number) => {
  return await db.runAsync('DELETE FROM chats WHERE id = ?', chatId);
};

export const renameChat = async (db: SQLiteDatabase, chatId: number, title: string) => {
  return await db.runAsync('UPDATE chats SET title = ? WHERE id = ?', title, chatId);
};

export interface ChatWithPreview extends Chat {
  preview: string;
}

export const getChatsWithPreview = async (db: SQLiteDatabase): Promise<ChatWithPreview[]> => {
  const chats = (await getChats(db)) as Chat[];
  const rows = await Promise.all(
    chats.map(async (chat) => {
      const last = await db.getFirstAsync<{ content: string }>(
        'SELECT content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1',
        chat.id
      );
      return { ...chat, preview: last?.content ?? '' };
    })
  );
  return rows;
};

export interface DbStats {
  chats: number;
  messages: number;
  images: number;
}

export const getStats = async (db: SQLiteDatabase): Promise<DbStats> => {
  const chats = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM chats');
  const messages = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM messages');
  const images = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE imageUrl IS NOT NULL AND imageUrl != ""');
  return {
    chats: chats?.n ?? 0,
    messages: messages?.n ?? 0,
    images: images?.n ?? 0,
  };
};

export interface GeneratedImage {
  id: number;
  imageUrl: string;
  prompt?: string;
  chatId: number;
}

/** Real agent-generated images still referenced by the local message DB. */
export const getGeneratedImages = async (db: SQLiteDatabase): Promise<GeneratedImage[]> => {
  return (await db.getAllAsync<GeneratedImage>(
    `SELECT id, imageUrl, prompt, chat_id AS chatId
       FROM messages
      WHERE imageUrl IS NOT NULL AND imageUrl != ''
      ORDER BY id DESC`
  ));
};

/* ------------------------------------------------------------------ */
/* Prompt Maker sessions (independent persistent history)              */
/* ------------------------------------------------------------------ */

export interface PromptSession {
  id: number;
  title: string;
  createdAt: number;
}

export const addPromptSession = async (db: SQLiteDatabase, title: string) => {
  return await db.runAsync('INSERT INTO prompt_sessions (title, created_at) VALUES (?, ?)', title, Date.now());
};

export const getPromptSessions = async (db: SQLiteDatabase): Promise<PromptSession[]> => {
  return await db.getAllAsync<PromptSession>('SELECT * FROM prompt_sessions ORDER BY id DESC');
};

export const getPromptMessages = async (db: SQLiteDatabase, sessionId: number): Promise<Message[]> => {
  return (await db.getAllAsync<Message>('SELECT * FROM prompt_messages WHERE session_id = ?', sessionId)).map(
    (message) => ({
      ...message,
      role: '' + message.role === 'bot' ? Role.Bot : Role.User,
    })
  );
};

export const addPromptMessage = async (
  db: SQLiteDatabase,
  sessionId: number,
  { content, role }: { content: string; role: Role }
) => {
  return await db.runAsync(
    'INSERT INTO prompt_messages (session_id, content, role) VALUES (?, ?, ?)',
    sessionId,
    content,
    role === Role.Bot ? 'bot' : 'user'
  );
};

export const deletePromptSession = async (db: SQLiteDatabase, sessionId: number) => {
  return await db.runAsync('DELETE FROM prompt_sessions WHERE id = ?', sessionId);
};

export const renamePromptSession = async (db: SQLiteDatabase, sessionId: number, title: string) => {
  return await db.runAsync('UPDATE prompt_sessions SET title = ? WHERE id = ?', title, sessionId);
};

export interface PromptSessionWithPreview extends PromptSession {
  preview: string;
}

export const getPromptSessionsWithPreview = async (db: SQLiteDatabase): Promise<PromptSessionWithPreview[]> => {
  const sessions = await getPromptSessions(db);
  const rows = await Promise.all(
    sessions.map(async (session) => {
      const last = await db.getFirstAsync<{ content: string }>(
        'SELECT content FROM prompt_messages WHERE session_id = ? AND role = ? ORDER BY id DESC LIMIT 1',
        session.id,
        'user'
      );
      return { ...session, preview: last?.content ?? '' };
    })
  );
  return rows;
};
