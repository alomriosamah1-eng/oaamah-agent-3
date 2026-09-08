// Prompt Maker — history record helpers (pure / Node-testable).
// The storage itself is an isolated table owned by the Prompt Maker module;
// this file only shapes records so the SQLite binding stays thin.

import { assessQuality } from '../agent/prompt-engine';
import type { PromptLang, PromptMakerOutput, PromptRecord } from '../types/prompt-types';

export interface HistoryDraft {
  title: string;
  userRequest: string;
  prompt: string;
  lang: PromptLang;
  intent: string;
  skillId: string;
}

export function draftFromOutput(output: PromptMakerOutput, userRequest: string): HistoryDraft {
  return {
    title: output.title,
    userRequest,
    prompt: output.prompt,
    lang: output.lang,
    intent: output.intent,
    skillId: output.skillId,
  };
}

export function makeRecord(draft: HistoryDraft, now: number = Date.now(), id?: number): PromptRecord {
  return { ...draft, id, createdAt: now, updatedAt: now };
}

export function sortByNewest(records: PromptRecord[]): PromptRecord[] {
  return [...records].sort((a, b) => b.createdAt - a.createdAt);
}

/** Promote a persisted record back to a full viewer output (quality re-derived). */
export function recordToOutput(record: PromptRecord): PromptMakerOutput {
  return {
    prompt: record.prompt,
    title: record.title,
    intent: record.intent,
    skillId: record.skillId,
    lang: record.lang,
    quality: assessQuality(record.prompt),
  };
}

export function previewOf(prompt: string, max = 140): string {
  const flat = prompt.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}