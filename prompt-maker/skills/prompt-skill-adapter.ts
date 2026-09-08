// Prompt Maker — Prompt Skill adapter.
//
// The project already carries a real, battle-tested prompt-engineering skill:
// the on-device skill library in utils/promptModel.ts (distilled from the
// open prompt-engineering skill ecosystem). This adapter is a thin, READ-ONLY
// surface over that library so the isolated Prompt Maker module owns its own
// skill API without mutating anything shared. No RN imports — Node-testable.

import {
  detectIntent,
  detectLang,
  getSkill,
  listSkills,
  type PromptIntent,
} from '../../utils/promptModel';

export interface PromptSkillView {
  id: string;
  name: string;
  intent: PromptIntent;
  description: string;
  rules: string[];
  antiPatterns: string[];
  checklist: string[];
}

const trim = (s: PromptSkillView): PromptSkillView => s;

export function listPromptSkills(): PromptSkillView[] {
  return listSkills().map(trim);
}

export function pickSkill(intent: PromptIntent): PromptSkillView {
  return trim(getSkill(intent));
}

export function skillForInput(input: string): PromptSkillView {
  return pickSkill(detectIntent(input));
}

export { detectIntent, detectLang };
export type { PromptIntent };