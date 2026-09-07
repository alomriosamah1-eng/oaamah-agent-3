// Pure orchestration helpers — no RN / Expo imports so they are Node-testable.
// Moved out of TaskOrchestrator.ts (which re-wires them) so the planning,
// ordering, retry-classification and budget logic can be tested in isolation.

import { detectLang } from './taskModel';
import { extractJson as strictExtractJson } from './jsonExtract';

export type OrcDepth = 'normal' | 'medium' | 'complex';

/** Overall safety budget per task depth — protects against runaway loops. */
export const OVERALL_TIMEOUTS: Record<OrcDepth, number> = {
  normal: 90_000,
  medium: 240_000,
  complex: 600_000,
};

export function overallTimeoutFor(depth: OrcDepth): number {
  return OVERALL_TIMEOUTS[depth] ?? OVERALL_TIMEOUTS.normal;
}

/**
 * Refined retry classification. Permanent (4xx, validation, permission) errors
 * are not retried; transient conditions (network, timeout, 5xx, 429/quota,
 * empty replies) are. Unknown errors keep the historical generous default
 * (retry) so existing behaviour is preserved for novel failure modes.
 */
export function classifyRetry(
  error: unknown,
  isAgentUnavailable = false,
): boolean {
  if (isAgentUnavailable) return false;
  if (!(error instanceof Error)) return true;
  const msg = error.message.toLowerCase();

  // Permanent client errors — retrying cannot fix them.
  if (/(?:^|[^\d])(?:400|401|403|404|406|410|413|415|416|422|424)[^\d]/.test(msg)) {
    return false;
  }
  if (/(?:invalid|unauthorized|forbidden|permission denied|not found|unsupported|bad request|validation)/.test(msg)) {
    return false;
  }

  // Transient conditions worth retrying.
  if (/(?:425|428|429|too many|rate|quota|overload)/.test(msg)) return true;
  if (/(?:timeout|timed ?out|abort|network|econn|eagain|etimedout|upstream|empty)/.test(msg)) return true;
  if (/(?:^|[^\d])5\d{2}/.test(msg)) return true;

  return true;
}

/** JSON parse that tolerates malformed replies (used by the plan builder). */
export function extractJson(raw: string): Record<string, unknown> | null {
  try {
    return strictExtractJson<Record<string, unknown>>(raw);
  } catch {
    return null;
  }
}

export function estimateDepth(subtaskCount: number, totalChars: number): OrcDepth {
  if (subtaskCount >= 5 || totalChars > 2000) return 'complex';
  if (subtaskCount >= 3 || totalChars > 1000) return 'medium';
  return 'normal';
}

/** Deterministic dependency-ordered execution sequence (DFS, cycle-safe). */
export function topologicalOrder<T extends { id: string; dependsOn: string[] }>(
  items: T[],
): T[] {
  const map = new Map(items.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const ordered: T[] = [];

  const visit = (item: T): void => {
    if (visited.has(item.id) || inStack.has(item.id)) return;
    inStack.add(item.id);
    for (const depId of item.dependsOn) {
      const dep = map.get(depId);
      if (dep) visit(dep);
    }
    inStack.delete(item.id);
    visited.add(item.id);
    ordered.push(item);
  };

  for (const item of items) visit(item);
  return ordered;
}

/** Builds the per-subtask execution prompt with prior dependency results. */
export function buildSubtaskPrompt<T extends { dependsOn: string[]; prompt: string }>(
  subtask: T,
  results: Map<string, string>,
  goal: string,
): string {
  const deps = subtask.dependsOn
    .map((id) => {
      const res = results.get(id);
      return res ? `[${id}]: ${res}` : null;
    })
    .filter(Boolean)
    .join('\n\n');

  const lang = detectLang(goal);

  if (deps) {
    return lang === 'ar'
      ? `الهدف العام: ${goal}\n\nنتائج الخطوات السابقة:\n${deps}\n\nمهمتك الحالية:\n${subtask.prompt}`
      : `Overall goal: ${goal}\n\nPrevious step results:\n${deps}\n\nYour current task:\n${subtask.prompt}`;
  }

  return lang === 'ar'
    ? `الهدف العام: ${goal}\n\nمهمتك:\n${subtask.prompt}`
    : `Overall goal: ${goal}\n\nYour task:\n${subtask.prompt}`;
}