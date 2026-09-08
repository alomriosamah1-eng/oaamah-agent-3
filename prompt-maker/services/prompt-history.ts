// Prompt Maker — independent persistence.
// Owns a dedicated `prompt_maker_history` table created lazily (idempotent),
// completely separate from chat sessions / prompt_sessions. No shared schema
// or migration is ever touched — this module is the only writer here.

import type { SQLiteDatabase } from 'expo-sqlite';
import type { PromptRecord } from '../types/prompt-types';
import { makeRecord, sortByNewest, type HistoryDraft } from './history-core';

const TABLE = 'prompt_maker_history';
const TABLE_SQL = `CREATE TABLE IF NOT EXISTS ${TABLE} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  user_request TEXT NOT NULL,
  generated_prompt TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  intent TEXT NOT NULL DEFAULT 'general',
  skill_id TEXT NOT NULL DEFAULT 'general',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

export async function initPromptHistory(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(TABLE_SQL);
}

const ROW_FIELDS =
  'id AS id, title AS title, user_request AS userRequest, generated_prompt AS prompt, ' +
  'lang AS lang, intent AS intent, skill_id AS skillId, created_at AS createdAt, updated_at AS updatedAt';

export async function savePromptRecord(db: SQLiteDatabase, draft: HistoryDraft): Promise<number> {
  const record = makeRecord(draft);
  const res = await db.runAsync(
    `INSERT INTO ${TABLE} (title, user_request, generated_prompt, lang, intent, skill_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    record.title,
    record.userRequest,
    record.prompt,
    record.lang,
    record.intent,
    record.skillId,
    record.createdAt,
    record.updatedAt,
  );
  return Number(res.lastInsertRowId);
}

export async function updatePromptRecord(db: SQLiteDatabase, record: PromptRecord): Promise<void> {
  if (record.id == null || record.id <= 0) return;
  await db.runAsync(
    `UPDATE ${TABLE} SET title = ?, user_request = ?, generated_prompt = ?, lang = ?, intent = ?, skill_id = ?, updated_at = ?
     WHERE id = ?`,
    record.title,
    record.userRequest,
    record.prompt,
    record.lang,
    record.intent,
    record.skillId,
    Date.now(),
    record.id,
  );
}

export async function listPromptRecords(db: SQLiteDatabase, limit = 100): Promise<PromptRecord[]> {
  const rows = await db.getAllAsync<PromptRecord>(
    `SELECT ${ROW_FIELDS} FROM ${TABLE} ORDER BY created_at DESC LIMIT ?`,
    limit,
  );
  return sortByNewest(rows);
}

export async function findPromptRecord(db: SQLiteDatabase, id: number): Promise<PromptRecord | null> {
  const rows = await db.getAllAsync<PromptRecord>(`SELECT ${ROW_FIELDS} FROM ${TABLE} WHERE id = ? LIMIT 1`, id);
  return rows[0] ?? null;
}

export async function deletePromptRecord(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM ${TABLE} WHERE id = ?`, id);
}