// Prompt Maker — the independent PromptMakerAgent.
//
// Single-purpose: transforms natural-language requests into ONE professional
// prompt, and nothing else. Hermetic by design — the only external input is the
// injectable LLM function, so the whole class is Node-testable with fakes and
// the real binding to the opencode server is supplied by the RN layer
// (llm-bridge.ts). This agent never executes tasks, never writes outside its
// own history, and always returns only the prompt text.

import type {
  LlmFn,
  PromptAnalysis,
  PromptLang,
  PromptMakerOutput,
  PromptTransformOp,
} from '../types/prompt-types';
import type { PromptIntent } from '../skills/prompt-skill-adapter';
import {
  assessQuality,
  buildAnalysisUser,
  buildInstructionPrompt,
  buildUserMessage,
  extractIntentLang,
  makeTitle,
  sanitizeOutput,
  type IntentExtract,
} from './prompt-engine';

export interface PromptMakerAgentOptions {
  lang?: PromptLang;
  intent?: PromptIntent;
  signal?: AbortSignal;
}

const MAX_TOKENS = 2400;

export class PromptMakerAgent {
  constructor(private readonly llm: LlmFn) {}

  /** Turn a natural-language request into a single professional prompt. */
  async generate(userRequest: string, opts: PromptMakerAgentOptions = {}): Promise<PromptMakerOutput> {
    const { lang, intent, skill } = extractIntentLang(userRequest, opts.lang, opts.intent);
    const reply = await this.llm(
      {
        system: buildInstructionPrompt(skill, lang),
        user: buildUserMessage(userRequest, lang),
        temperature: 0.5,
        maxTokens: MAX_TOKENS,
        sessionKey: 'prompt-maker',
      },
      opts.signal,
    );
    return this.finish(reply, userRequest, { lang, intent, skill });
  }

  /** Rebuild / improve / shorten / expand an existing prompt. */
  async transform(
    userRequest: string,
    current: string,
    op: PromptTransformOp,
    opts: PromptMakerAgentOptions = {},
  ): Promise<PromptMakerOutput> {
    const { lang, intent, skill } = extractIntentLang(userRequest, opts.lang, opts.intent);
    const reply = await this.llm(
      {
        system: buildInstructionPrompt(skill, lang),
        user: buildUserMessage(userRequest, lang, { op, current }),
        temperature: 0.5,
        maxTokens: MAX_TOKENS,
        sessionKey: 'prompt-maker',
      },
      opts.signal,
    );
    return this.finish(reply, userRequest, { lang, intent, skill });
  }

  /** Review a prompt against the quality criteria (read-only, not the mission). */
  async analyze(promptText: string, opts: PromptMakerAgentOptions = {}): Promise<PromptAnalysis> {
    const lang = opts.lang ?? extractIntentLang(promptText).lang;
    const quality = assessQuality(promptText);
    const system =
      lang === 'ar'
        ? 'أنت خبير مراجعة برومبتات. وازن الإيجابيات والسلبيات واقترح تحسينات محددة. أعد تقريرًا موجزًا منسّقًا بقوائم قصيرة.'
        : 'You are a prompt review expert. Weigh strengths and weaknesses and suggest specific improvements. Return a concise report with short lists.';

    const summary = await this.llm(
      { system, user: buildAnalysisUser(promptText, lang, quality.missing), temperature: 0.4, maxTokens: 1200, sessionKey: 'prompt-maker' },
      opts.signal,
    );

    return {
      score: quality.score,
      summary,
      strengths: quality.passed.map((p) => `present: ${p}`),
      weaknesses: quality.missing.map((m) => `missing: ${m}`),
      suggestions: quality.missing,
    };
  }

  private finish(
    reply: string,
    userRequest: string,
    extract: IntentExtract,
  ): PromptMakerOutput {
    const prompt = sanitizeOutput(reply);
    return {
      prompt,
      title: makeTitle(userRequest, extract.intent, extract.lang),
      intent: extract.intent,
      skillId: extract.skill.id,
      lang: extract.lang,
      quality: assessQuality(prompt),
    };
  }
}