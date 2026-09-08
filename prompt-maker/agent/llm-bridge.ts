// Prompt Maker — LLM binding (RN-only).
// Default binding for PromptMakerAgent: the app's own opencode agent engine
// (server-first; prompts depend on the opencode server exactly like chat).
// Uses the streaming transport when the caller wants live progress so the
// prompt appears as it is written instead of arriving in one slow chunk.
// Lives separately so the pure agent core stays Node-testable.

import { chatComplete, chatStream, getSelectedZenModel } from '@/utils/OpenCodeAgent';
import type { LlmFn } from '../types/prompt-types';

export const promptMakerLlm: LlmFn = async (req, signal) => {
  const base = {
    system: req.system,
    user: req.user,
    temperature: req.temperature ?? 0.6,
    maxTokens: req.maxTokens,
    model: req.model ?? (await getSelectedZenModel().catch(() => undefined)),
    sessionKey: req.sessionKey ?? 'prompt-maker',
  };

  if (req.onPartial) {
    return chatStream({ ...base, onDelta: (delta) => req.onPartial?.(delta) }, signal);
  }
  return chatComplete(base, signal);
};