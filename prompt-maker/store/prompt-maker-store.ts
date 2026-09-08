// Prompt Maker — independent state container.
// A tiny observable store (no React dependency in the core) that owns the
// Prompt Maker screen state: generation status, current prompt, and the
// isolated history list. The screen subscribes via useSyncExternalStore.

import type { PromptRecord } from '../types/prompt-types';

export type PromptMakerStatus = 'idle' | 'generating' | 'error';

export interface PromptMakerState {
  status: PromptMakerStatus;
  error?: string;
  current?: PromptRecord;
  history: PromptRecord[];
}

type Listener = () => void;

class PromptMakerStore {
  private state: PromptMakerState = { status: 'idle', history: [] };
  private listeners = new Set<Listener>();

  getState = (): PromptMakerState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private commit(partial: Partial<PromptMakerState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener();
  }

  setGenerating(generating: boolean, error?: string): void {
    if (generating) this.commit({ status: 'generating', error: undefined });
    else this.commit({ ...(error ? { status: 'error', error } : { status: 'idle', error: undefined }) });
  }

  setCurrent(record: PromptRecord | undefined): void {
    this.commit({ current: record });
  }

  setHistory(history: PromptRecord[]): void {
    this.commit({ history });
  }

  upsertHistory(record: PromptRecord): void {
    const exists = record.id != null && this.state.history.some((r) => r.id === record.id);
    const next = exists
      ? this.state.history.map((r) => (r.id === record.id ? { ...r, ...record } : r))
      : [record, ...this.state.history];
    this.commit({ history: next, ...(this.state.current?.id === record.id ? { current: record } : {}) });
  }

  removeFromHistory(id: number): void {
    const history = this.state.history.filter((r) => r.id !== id);
    this.commit({ history, ...(this.state.current?.id === id ? { current: undefined } : {}) });
  }

  reset(): void {
    this.commit({ status: 'idle', error: undefined, current: undefined });
  }
}

export const promptMakerStore = new PromptMakerStore();