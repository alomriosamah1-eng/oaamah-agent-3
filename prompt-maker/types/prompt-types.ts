// Prompt Maker — shared types, kept free of any RN / Expo import so the pure
// core modules are testable directly under Node (tests/promptArchitect.test).

export type PromptLang = 'ar' | 'en';

export interface PromptQuality {
  score: number;
  passed: string[];
  missing: string[];
}

/** A single build/transform output produced by the PromptMakerAgent. */
export interface PromptMakerOutput {
  prompt: string;
  title: string;
  intent: string;
  skillId: string;
  lang: PromptLang;
  quality: PromptQuality;
}

/** Persisted history entry — one user request → one generated prompt. */
export interface PromptRecord {
  id?: number;
  title: string;
  userRequest: string;
  prompt: string;
  lang: PromptLang;
  intent: string;
  skillId: string;
  createdAt: number;
  updatedAt: number;
}

export type PromptTransformOp = 'regenerate' | 'improve' | 'shorten' | 'expand';

export interface PromptAnalysis {
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

/** Shape accepted by the (injectable) LLM used by the agent. */
export interface LlmRequest {
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  sessionKey?: string;
}

export type LlmFn = (req: LlmRequest, signal?: AbortSignal) => Promise<string>;