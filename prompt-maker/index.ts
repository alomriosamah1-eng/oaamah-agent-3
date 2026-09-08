// Prompt Maker — public facade for the isolated module.

export { PromptMakerAgent } from './agent/PromptMakerAgent';
export type { PromptMakerAgentOptions } from './agent/PromptMakerAgent';
export { promptMakerLlm } from './agent/llm-bridge';

export {
  extractIntentLang,
  buildInstructionPrompt,
  buildUserMessage,
  sanitizeOutput,
  assessQuality,
  makeTitle,
} from './agent/prompt-engine';

export { listPromptSkills, pickSkill, skillForInput } from './skills/prompt-skill-adapter';
export type { PromptSkillView } from './skills/prompt-skill-adapter';

export {
  initPromptHistory,
  savePromptRecord,
  updatePromptRecord,
  listPromptRecords,
  findPromptRecord,
  deletePromptRecord,
} from './services/prompt-history';

export { draftFromOutput, makeRecord, sortByNewest, previewOf, recordToOutput } from './services/history-core';

export { promptMakerStore } from './store/prompt-maker-store';
export type { PromptMakerState, PromptMakerStatus } from './store/prompt-maker-store';
export { usePromptMakerStore } from './store/usePromptMakerStore';

export type {
  PromptLang,
  PromptQuality,
  PromptMakerOutput,
  PromptRecord,
  PromptTransformOp,
  PromptAnalysis,
  LlmRequest,
  LlmFn,
} from './types/prompt-types';