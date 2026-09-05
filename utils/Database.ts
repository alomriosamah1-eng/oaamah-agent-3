import { Chat, Message, Role } from '@/utils/Interfaces';
import { type SQLiteDatabase } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  // Log DB path for debugging
  // console.log(FileSystem.documentDirectory);
  const DATABASE_VERSION = 1;
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
  // if (currentDbVersion === 1) {
  //   Add more migrations
  // }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

export const addChat = async (db: SQLiteDatabase, title: string) => {
  return await db.runAsync('INSERT INTO chats (title) VALUES (?)', title);
};

export const getChats = async (db: SQLiteDatabase) => {
  return await db.getAllAsync('SELECT * FROM chats');
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
