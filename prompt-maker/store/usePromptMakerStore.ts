// Prompt Maker — store subscription hook (RN-only).

import { useSyncExternalStore } from 'react';
import { promptMakerStore, type PromptMakerState } from './prompt-maker-store';

export function usePromptMakerStore(): PromptMakerState {
  return useSyncExternalStore(promptMakerStore.subscribe, promptMakerStore.getState);
}