// Task Type — a frontend-only hint layer for chat requests.
//
// The opencode chat backend has no task-level field today, so the selected
// level is persisted locally and woven into the outgoing prompt as a natural
// instruction line. When/if a real agent parameter exists, swap this layer for
// a direct field without touching the UI.

import AsyncStorage from '@react-native-async-storage/async-storage';

export type TaskLevel = 'normal' | 'medium' | 'complex';

export const TASK_LEVELS: readonly TaskLevel[] = ['normal', 'medium', 'complex'];

const TASK_TYPE_KEY = 'osamah:taskType';

export const TASK_LEVEL_ICONS: Record<TaskLevel, string> = {
  normal: 'bolt',
  medium: 'speed',
  complex: 'dashboard-customize',
};

/** A short English instruction line added to the prompt for the chosen level. */
export function taskLevelDirective(level: TaskLevel): string {
  switch (level) {
    case 'normal':
      return '';
    case 'medium':
      return '[Task level: medium] Tackle this as a routine but careful task: break it into clear steps and give a complete, accurate answer.';
    case 'complex':
      return '[Task level: complex] Treat this as a deep, multi-step task: analyze the request, plan the steps, reason carefully, and deliver a thorough, well-structured result.';
    default:
      return '';
  }
}

export function loadTaskType(): Promise<TaskLevel | null> {
  return AsyncStorage.getItem(TASK_TYPE_KEY).then((v) =>
    v && (TASK_LEVELS as readonly string[]).includes(v) ? (v as TaskLevel) : null
  );
}

export function saveTaskType(level: TaskLevel): Promise<void> {
  return AsyncStorage.setItem(TASK_TYPE_KEY, level);
}