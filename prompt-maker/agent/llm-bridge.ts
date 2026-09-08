// Prompt Maker — LLM binding (RN-only).
// Default binding for PromptMakerAgent: the app's own opencode agent engine
// (server-first; prompts depend on the opencode server exactly like chat).
// Lives separately so the pure agent core stays Node-testable.

import { chatComplete, getSelectedZenModel } from '@/utils/OpenCodeAgent';
import type { LlmFn } from '../types/prompt-types';

export const promptMakerLlm: LlmFn = async (req, signal) =>
  chatComplete(
    {
      system: req.system,
      user: req.user,
      temperature: req.temperature ?? 0.6,
      maxTokens: req.maxTokens,
      model: req.model ?? (await getSelectedZenModel().catch(() => undefined)),
      sessionKey: req.sessionKey ?? 'prompt-maker',
    },
    signal,
  );