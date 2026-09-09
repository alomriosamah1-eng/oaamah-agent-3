import { chatComplete, AgentUnavailableError } from '@/utils/OpenCodeAgent';
import { detectLang } from '@/utils/taskModel';
import {
  buildSubtaskPrompt,
  classifyRetry,
  estimateDepth,
  extractJson,
  overallTimeoutFor,
  topologicalOrder,
} from '@/utils/orchestrationModel';
export { isComplexTask } from '@/utils/taskModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskPhase =
  | 'queued'
  | 'planning'
  | 'executing'
  | 'processing'
  | 'verifying'
  | 'retrying'
  | 'completed'
  | 'failed';

export interface Subtask {
  id: string;
  label: string;
  labelEn: string;
  prompt: string;
  systemPrompt?: string;
  dependsOn: string[];
  result?: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
}

export interface TaskPlan {
  id: string;
  goal: string;
  goalEn: string;
  subtasks: Subtask[];
  depth: 'normal' | 'medium' | 'complex';
  needsPdf: boolean;
  profileContext?: string;
}

export interface OrchestrationCallbacks {
  onPhase?: (phase: TaskPhase, statusText?: string) => void;
  onSubtaskUpdate?: (
    subtaskId: string,
    status: 'pending' | 'running' | 'done' | 'failed',
  ) => void;
  signal?: AbortSignal;
  model?: string;
  profileContext?: string;
}

export interface OrchestrationResult {
  success: boolean;
  finalResult: string;
  failedSubtasks: string[];
  totalSubtasks: number;
  completedSubtasks: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RETRY_DELAYS = [2000, 4000, 8000];
const MAX_ATTEMPTS = 3;
// These are per-stage budgets. The overall task budget in orchestrationModel
// remains the final safety fence, so a slow but valid long task is not aborted
// merely because one OpenCode stage needs more time.
const PLANNING_TIMEOUT = 3 * 60_000;
const SUBTASK_TIMEOUT_SIMPLE = 2 * 60_000;
const SUBTASK_TIMEOUT_COMPLEX = 5 * 60_000;
const COMPILATION_TIMEOUT = 5 * 60_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Task detection
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Plan builder
// ---------------------------------------------------------------------------

const PLAN_SYSTEM_AR = `أنت مخطّط مهام ذكي. مهمتك تحويل طلب المستخدم إلى خطة عمل منظمة.
أعد JSON فقط — لا شرح، لا تعليقات.
الخطة يجب أن تحتوي على خطوات متسلسلة.
كل خطوة لها: id, label (عربي), labelEn (إنجليزي), prompt (التعليمات التفصيلية), dependsOn (معرّفات الخطوات التي تعتمد عليها).
لا تقلل من جودة الخطة مهما كانت المهمة كبيرة.
الحد الأقصى 8 خطوات.`;

const PLAN_SYSTEM_EN = `You are a smart task planner. Convert the user's request into an organized plan.
Return ONLY JSON — no explanation, no commentary.
The plan must contain sequential steps.
Each step has: id, label (English), labelEn (English), prompt (detailed instructions), dependsOn (IDs this step depends on).
Never reduce quality regardless of task size.
Maximum 8 steps.`;

async function buildPlan(
  request: string,
  callbacks: OrchestrationCallbacks,
  deps?: { llm?: typeof chatComplete },
): Promise<TaskPlan> {
  const lang = detectLang(request);
  const llm = deps?.llm ?? chatComplete;

  const response = await llm(
    {
      system: lang === 'ar' ? PLAN_SYSTEM_AR : PLAN_SYSTEM_EN,
      user: request,
      temperature: 0.3,
      maxTokens: 2000,
      model: callbacks.model,
    },
    callbacks.signal,
  );

  const parsed = extractJson(response);
  if (
    !parsed ||
    !Array.isArray(parsed.subtasks) ||
    parsed.subtasks.length === 0
  ) {
    throw new Error('invalid_json_plan');
  }

  const subtasks: Subtask[] = parsed.subtasks.map(
    (s: Record<string, unknown>) => ({
      id: String(s.id ?? generateId()),
      label: String(s.label ?? ''),
      labelEn: String(s.labelEn ?? ''),
      prompt: String(s.prompt ?? ''),
      systemPrompt: s.systemPrompt ? String(s.systemPrompt) : undefined,
      dependsOn: Array.isArray(s.dependsOn)
        ? (s.dependsOn as unknown[]).map(String)
        : [],
      status: 'pending' as const,
      attempts: 0,
    }),
  );

  const totalChars = subtasks.reduce((a, s) => a + s.prompt.length, 0);

  return {
    id: generateId(),
    goal: String(parsed.goal ?? request.slice(0, 100)),
    goalEn: String(parsed.goalEn ?? request.slice(0, 100)),
    subtasks,
    depth: estimateDepth(subtasks.length, totalChars),
    needsPdf: subtasks.some(
      (s) =>
        s.prompt.toLowerCase().includes('pdf') ||
        s.label.toLowerCase().includes('pdf'),
    ),
    profileContext: callbacks.profileContext,
  };
}

// ---------------------------------------------------------------------------
// Compile results
// ---------------------------------------------------------------------------

async function compileResults(
  plan: TaskPlan,
  results: Map<string, string>,
  failedSubtasks: string[],
  profileContext?: string,
  signal?: AbortSignal,
  llm?: typeof chatComplete,
): Promise<string> {
  const lang = detectLang(plan.goal);

  const sections = plan.subtasks
    .map((st) => {
      const status = failedSubtasks.includes(st.id)
        ? lang === 'ar'
          ? '⚠️ (غير مكتمل)'
          : '⚠️ (incomplete)'
        : '✅';
      const content = results.get(st.id) ?? '(no result)';
      return `### ${st.label} ${st.labelEn} ${status}\n${content}`;
    })
    .join('\n\n');

  const system =
    lang === 'ar'
      ? `أنت محرّر ذكي. مهمتك تجميع نتائج المهمات الفرعية في إجابة واحدة شاملة ومتناسقة.
لا تقلل من الجودة أو الإتقان. أعد النتيجة الكاملة بالترتيب.
لا تذكر خطوات التخطيط internals — فقط عرض النتيجة النهائية.
${profileContext ? `سياق المستخدم:\n${profileContext}` : ''}`
      : `You are a smart editor. Your task is to compile subtask results into one comprehensive, coherent answer.
Never reduce quality or completeness. Return the full result in order.
Do not expose planning internals — only the final answer.
${profileContext ? `User context:\n${profileContext}` : ''}`;

  const user =
    lang === 'ar'
      ? `الطلب الأصلي:\n${plan.goal}\n\n---\n\nالنتائج:\n${sections}\n\n---\n\n${failedSubtasks.length > 0 ? `مهام فاشلة: ${failedSubtasks.length}` : 'جميع المهام نجحت'}\n\nأعد النتيجة النهائية الشاملة.`
      : `Original request:\n${plan.goalEn}\n\n---\n\nResults:\n${sections}\n\n---\n\n${failedSubtasks.length > 0 ? `Failed tasks: ${failedSubtasks.length}` : 'All tasks succeeded'}\n\nReturn the comprehensive final result.`;

  const compile = llm ?? chatComplete;
  return compile(
    { system, user, temperature: 0.4, maxTokens: 4000 },
    signal,
  );
}

// ---------------------------------------------------------------------------
// Execute task
// ---------------------------------------------------------------------------

function timeoutFor(depth: TaskPlan['depth']): number {
  if (depth === 'complex') return SUBTASK_TIMEOUT_COMPLEX;
  return SUBTASK_TIMEOUT_SIMPLE;
}

async function executeSubtaskWithRetry(
  subtask: Subtask,
  prompt: string,
  plan: TaskPlan,
  callbacks: OrchestrationCallbacks,
  results: Map<string, string>,
  llm?: typeof chatComplete,
): Promise<boolean> {
  const lang = detectLang(plan.goal);
  const execute = llm ?? chatComplete;
  const model = callbacks.model;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (callbacks.signal?.aborted) return false;

    subtask.attempts++;
    subtask.status = 'running';
    callbacks.onSubtaskUpdate?.(subtask.id, 'running');

    try {
      const response = await execute(
        {
          system: subtask.systemPrompt,
          user: prompt,
          temperature: 0.5,
          maxTokens: 3000,
          model,
          timeoutMs: timeoutFor(plan.depth),
        },
        callbacks.signal,
      );

      if (!response || response.trim().length === 0) {
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(RETRY_DELAYS[attempt]);
          continue;
        }
        subtask.status = 'failed';
        callbacks.onSubtaskUpdate?.(subtask.id, 'failed');
        return false;
      }

      subtask.result = response;
      subtask.status = 'done';
      results.set(subtask.id, response);
      callbacks.onSubtaskUpdate?.(subtask.id, 'done');
      return true;
    } catch (error) {
      if (callbacks.signal?.aborted) {
        subtask.status = 'failed';
        callbacks.onSubtaskUpdate?.(subtask.id, 'failed');
        return false;
      }

      if (!classifyRetry(error, error instanceof AgentUnavailableError)) {
        subtask.status = 'failed';
        callbacks.onSubtaskUpdate?.(subtask.id, 'failed');
        return false;
      }

      if (attempt < MAX_ATTEMPTS - 1) {
        subtask.status = 'failed'; // temporary
        callbacks.onPhase?.(
          'retrying',
          lang === 'ar'
            ? `إعادة محاولة ${subtask.label} (${attempt + 2}/${MAX_ATTEMPTS})…`
            : `Retrying ${subtask.labelEn} (${attempt + 2}/${MAX_ATTEMPTS})…`,
        );
        await sleep(RETRY_DELAYS[attempt]);
      } else {
        subtask.status = 'failed';
        callbacks.onSubtaskUpdate?.(subtask.id, 'failed');
        return false;
      }
    }
  }

  subtask.status = 'failed';
  callbacks.onSubtaskUpdate?.(subtask.id, 'failed');
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function executeTask(
  request: string,
  callbacks: OrchestrationCallbacks,
  deps?: { llm?: typeof chatComplete },
): Promise<OrchestrationResult> {
  const lang = detectLang(request);

  callbacks.onPhase?.(
    'planning',
    lang === 'ar' ? 'جارٍ التحليل…' : 'Analyzing…',
  );

  let plan: TaskPlan;
  try {
    plan = await buildPlan(request, callbacks, deps);
  } catch (error) {
    const isInvalid =
      error instanceof Error && error.message === 'invalid_json_plan';
    if (!isInvalid) {
      throw error;
    }
    // retry once with a stricter prompt
    callbacks.onPhase?.(
      'retrying',
      lang === 'ar' ? 'إعادة التخطيط…' : 'Replanning…',
    );
    try {
      plan = await buildPlan(request, callbacks, deps);
    } catch (second) {
      // Planning failed twice — answer directly instead of collapsing the task.
      if (callbacks.signal?.aborted) throw second;
      callbacks.onPhase?.(
        'processing',
        lang === 'ar' ? 'جارٍ الإجابة مباشرة…' : 'Answering directly…',
      );
      const direct = deps?.llm ?? chatComplete;
      const reply = await direct(
        {
          user: request,
          temperature: 0.5,
          maxTokens: 4000,
          model: callbacks.model,
        },
        callbacks.signal,
      );
      callbacks.onPhase?.(
        'completed',
        lang === 'ar' ? 'اكتملت المهمة' : 'Task complete',
      );
      return {
        success: true,
        finalResult: reply,
        failedSubtasks: [],
        totalSubtasks: 0,
        completedSubtasks: 0,
      };
    }
  }

  const ordered = topologicalOrder(plan.subtasks);
  const results = new Map<string, string>();
  const failedSubtasks: string[] = [];
  const deadline = Date.now() + overallTimeoutFor(plan.depth);

  callbacks.onPhase?.(
    'executing',
    lang === 'ar' ? 'جارٍ التنفيذ…' : 'Executing…',
  );

  for (const subtask of ordered) {
    if (callbacks.signal?.aborted || Date.now() > deadline) {
      subtask.status = 'failed';
      callbacks.onSubtaskUpdate?.(subtask.id, 'failed');
      failedSubtasks.push(subtask.id);
      continue;
    }

    callbacks.onPhase?.('executing', subtask.label);
    callbacks.onSubtaskUpdate?.(subtask.id, 'pending');

    const prompt = buildSubtaskPrompt(subtask, results, plan.goal);

    const ok = await executeSubtaskWithRetry(
      subtask,
      prompt,
      plan,
      callbacks,
      results,
      deps?.llm,
    );

    if (!ok) {
      failedSubtasks.push(subtask.id);
    }
  }

  callbacks.onPhase?.(
    'processing',
    lang === 'ar' ? 'جارٍ التجميع…' : 'Compiling…',
  );

  let finalResult: string;
  try {
    finalResult = await compileResults(
      plan,
      results,
      failedSubtasks,
      plan.profileContext,
      callbacks.signal,
      deps?.llm,
    );
  } catch {
    finalResult =
      Array.from(results.values()).join('\n\n') ||
      (lang === 'ar'
        ? 'حدث خطأ أثناء تجميع النتائج.'
        : 'An error occurred while compiling results.');
  }

  callbacks.onPhase?.(
    'verifying',
    lang === 'ar' ? 'جارٍ التحقق…' : 'Verifying…',
  );

  const verify = deps?.llm ?? chatComplete;
    try {
      const verifyLang = lang;
      const verifyResponse = await verify(
      {
        system:
          verifyLang === 'ar'
            ? 'أنت مُراجع جودة. هل الإجابة التالية تجيب عن سؤال المستخدم بشكل كامل؟ أعد "PASS" أو "FAIL" فقط.'
            : 'You are a quality reviewer. Does the following answer fully address the user\'s question? Reply ONLY "PASS" or "FAIL".',
        user:
          verifyLang === 'ar'
            ? `السؤال: ${plan.goal}\n\nالإجابة: ${finalResult}\n\nأعد PASS أو FAIL فقط.`
            : `Question: ${plan.goalEn}\n\nAnswer: ${finalResult}\n\nReply ONLY PASS or FAIL.`,
        temperature: 0.0,
        maxTokens: 10,
      },
      callbacks.signal,
    );

    if (verifyResponse.trim().toUpperCase() === 'FAIL') {
      callbacks.onPhase?.(
        'retrying',
        lang === 'ar' ? 'جارٍ الإصلاح…' : 'Fixing…',
      );

      for (const subtask of ordered) {
        if (!failedSubtasks.includes(subtask.id)) continue;
        if (callbacks.signal?.aborted) break;

        const prompt = buildSubtaskPrompt(subtask, results, plan.goal);
        const ok = await executeSubtaskWithRetry(
          subtask,
          prompt,
          plan,
          callbacks,
          results,
          deps?.llm,
        );

        if (ok) {
          failedSubtasks.splice(failedSubtasks.indexOf(subtask.id), 1);
        }
      }

      if (failedSubtasks.length < ordered.length) {
        try {
          finalResult = await compileResults(
            plan,
            results,
            failedSubtasks,
            plan.profileContext,
            callbacks.signal,
            deps?.llm,
          );
        } catch {
          // keep previous finalResult
        }
      }
    }
  } catch {
    // verification is optional — proceed with current result
  }

  callbacks.onPhase?.(
    failedSubtasks.length === 0 ? 'completed' : 'failed',
    failedSubtasks.length === 0
      ? lang === 'ar'
        ? 'اكتملت المهمة'
        : 'Task complete'
      : lang === 'ar'
        ? `اكتملت مع ${failedSubtasks.length} مهمة فاشلة`
        : `Completed with ${failedSubtasks.length} failed task(s)`,
  );

  return {
    success: failedSubtasks.length === 0,
    finalResult,
    failedSubtasks,
    totalSubtasks: ordered.length,
    completedSubtasks: ordered.length - failedSubtasks.length,
  };
}
