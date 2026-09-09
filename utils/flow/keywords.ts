// Keywords engine for the OSAMAH FLOW feed.
// Builds a smart allow-list from profile + skills + agent refinement,
// and provides client-side filtering to block irrelevant content.

import { type SQLiteDatabase } from 'expo-sqlite';
import { getActiveKeywords, getAvoidKeywords, clearAgentKeywords, addKeyword } from '@/utils/flow/flowDB';
import { loadProfile } from '@/utils/UserProfile';
import { buildProfileContext } from '@/utils/profileModel';
import { listSkills } from '@/utils/PromptMaker';
import { chatComplete } from '@/utils/OpenCodeAgent';
import { storage } from '@/utils/Storage';

const FLOW_KEYWORDS_KEY = 'flowKeywordsLastRefresh';
const FLOW_PROFILE_VERSION_KEY = 'flowKeywordsProfileVersion';
const STALE_MS = 12 * 60 * 60 * 1000; // 12 hours
const KEYWORD_TIMEOUT_MS = 20 * 1000; // never let LLM tuning hang the feed

const DEFAULT_FLOW_KEYWORDS = [
  'تقنية',
  'برمجة',
  'ذكاء اصطناعي',
  'تطوير',
  'تعلم',
  'إنتاجية',
  'technology',
  'programming',
  'artificial intelligence',
  'software development',
  'tools',
];
const DEFAULT_AVOID = ['spam', 'scam'];

/* ------------------------------------------------------------------ */
/* Profile + skills → seed keywords                                   */
/* ------------------------------------------------------------------ */

function extractProfileKeywords(profile: { interests: string[]; profession?: string; specialization?: string; field?: string; goals: string[]; preferredTopics: string[]; productionGoals: string[]; learningGoals: string[] }): string[] {
  const words = new Set<string>();
  for (const w of profile.interests) if (w) words.add(w);
  if (profile.profession) words.add(profile.profession);
  if (profile.specialization) words.add(profile.specialization);
  if (profile.field) words.add(profile.field);
  for (const w of profile.goals) if (w) words.add(w);
  for (const w of profile.preferredTopics) if (w) words.add(w);
  for (const w of profile.productionGoals) if (w) words.add(w);
  for (const w of profile.learningGoals) if (w) words.add(w);
  return Array.from(words);
}

function extractSkillKeywords(): string[] {
  try {
    const skills = listSkills();
    const names = skills.map((s) => s.name).filter(Boolean);
    // also include some intent hints
    const intents = skills.map((s) => s.intent).filter(Boolean);
    return Array.from(new Set([...names, ...intents]));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Agent-generated keywords + avoid list                               */
/* ------------------------------------------------------------------ */

interface KeywordGeneration {
  keywords: string[];
  avoid: string[];
}

const AR_SYSTEM = `أنت نظام تنقية محتوى لflix قصير في تطبيق "وكيل أسامة". مهمتك:

1. ألّف قائمة كلمات مفتاحية (keywords) RelevantPassphrase محتوى الريلز المطلوب.
2. ألّف قائمة avoid كلمات topics أمنع ظهور محتوى related及其他.

Input: معلومات المستخدم + المهارات + كلمات أساسية.
Output ONLY JSON (لا نص آخر):

{
  "keywords": ["كلمة1", "كلمة2", ...],
  "avoid": ["كلمة1", "كلمة2", ...]
}

القيود:
- keywords: 5-12 كلمة/عبارة متعلقة باهتمامات المستخدم وتخصصه.
- avoid: 2-6 كلمة لمحتوى无关/غير مرغوب فيه.
- لا تستخدم كلمات عامة جداً (فيديو، فيديوهات، ريلز).
- إذا كان المستخدم مبرمجاً: ركّز على برمجة، تقنية، تطوير.
- إذا كان يهتم بالمهارات: أضف مهارات ذكاء اصطناعي، أدوات رقمية.
- إذا لم يكن هناك ملف شخصي مكتمل: أبقِ keywords عامة مناسبة.`;

const EN_SYSTEM = `You are a content filtering system for short-form video in the Osamah AI agent app.

Given user profile + skills, output ONLY valid JSON (no other text):

{
  "keywords": ["keyword1", "keyword2", ...],
  "avoid": ["keyword1", "keyword2", ...]
}

Rules:
- keywords: 5-12 terms relevant to the user's interests/profession.
- avoid: 2-6 terms for unwanted/unrelated content.
- Never include generic terms (video, shorts, reels).
- If user is a programmer: focus on coding, tech, development topics.
- If user has AI skill interests: include AI, tools, automation.
- If profile is minimal: use moderate general keywords (tech, learning, productivity).`;

export async function generateFlowKeywords(
  db: SQLiteDatabase,
  signal?: AbortSignal
): Promise<{ keywords: string[]; avoid: string[] }> {
  const profile = await loadProfile();
  const lang = profile.preferredLanguage ?? 'ar';
  const profileCtx = buildProfileContext(profile, lang);
  const skillKw = extractSkillKeywords();
  const seedKw = extractProfileKeywords(profile);

  const userMsg = [
    profileCtx ?? '',
    'المهارات/الاهتمامات الأساسية: ' + skillKw.join('، '),
    'الكلمات المستخرجة من الملف: ' + seedKw.join('، '),
  ].filter(Boolean).join('\n');

  const system = lang === 'ar' ? AR_SYSTEM : EN_SYSTEM;
  const response = await chatComplete({ system, user: userMsg, temperature: 0, maxTokens: 400 }, signal);
  return parseKeywordJson(response);
}

function parseKeywordJson(text: string): { keywords: string[]; avoid: string[] } {
  // Try to extract JSON from text that might have markdown code blocks
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { keywords: [], avoid: [] };
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.map((k: string) => String(k).trim()).filter(Boolean)
      : [];
    const avoid = Array.isArray(parsed.avoid)
      ? parsed.avoid.map((k: string) => String(k).trim()).filter(Boolean)
      : [];
    return { keywords: keywords.slice(0, 12), avoid: avoid.slice(0, 6) };
  } catch {
    return { keywords: [], avoid: [] };
  }
}

/* ------------------------------------------------------------------ */
/* Refresh orchestrator                                                */
/* ------------------------------------------------------------------ */

export async function refreshFlowKeywords(db: SQLiteDatabase): Promise<void> {
  // Clear old agent keywords
  await clearAgentKeywords(db);
  const profile = await loadProfile();

  // Generate new, but bound the time. When the LLM gateway is slow/unreachable
  // (or returns unusable JSON), fall back to a sensible default seed so the
  // FLOW section still has a meaningful allow-list and never stalls.
  let result: { keywords: string[]; avoid: string[] } = { keywords: [], avoid: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KEYWORD_TIMEOUT_MS);
  try {
    result = await generateFlowKeywords(db, controller.signal);
  } catch {
    result = { keywords: [], avoid: [] };
  } finally {
    clearTimeout(timer);
  }

  const kws = result.keywords.length > 0 ? result.keywords : DEFAULT_FLOW_KEYWORDS;
  const avd = result.avoid.length > 0 ? result.avoid : DEFAULT_AVOID;

  // Store
  for (const kw of kws) {
    await addKeyword(db, kw, 'agent', 2);
  }
  // Store avoid keywords separately (blocked topics)
  for (const kw of avd) {
    await addKeyword(db, kw, 'avoid', 1);
  }

  await storage.set(FLOW_KEYWORDS_KEY, String(Date.now()));
  await storage.set(FLOW_PROFILE_VERSION_KEY, String(profile.lastUpdated ?? 0));
}

/* ------------------------------------------------------------------ */
/* Staleness check                                                     */
/* ------------------------------------------------------------------ */

export async function shouldRefreshKeywords(db: SQLiteDatabase): Promise<boolean> {
  const lastRefresh = Number((await storage.getString(FLOW_KEYWORDS_KEY)) ?? '0');
  const profile = await loadProfile();
  const profileVersion = Number((await storage.getString(FLOW_PROFILE_VERSION_KEY)) ?? '0');
  if ((profile.lastUpdated ?? 0) > profileVersion) return true;
  if (Date.now() - lastRefresh >= STALE_MS) return true;
  const count = await getActiveKeywords(db);
  return count.length === 0;
}

export async function loadFilterLists(db: SQLiteDatabase): Promise<{ allow: string[]; avoid: string[] }> {
  const [allow, avoid] = await Promise.all([getActiveKeywords(db), getAvoidKeywords(db)]);
  return { allow, avoid };
}

/* ------------------------------------------------------------------ */
/* Client-side filter (allowlist + avoid)                              */
/* ------------------------------------------------------------------ */

/**
 * Determines whether a video should be shown to the user.
 * True = passes filter (show it). False = blocked.
 */
export function passesFilter(
  title: string,
  description: string,
  channelName: string,
  allowKeywords: string[],
  avoidKeywords: string[]
): boolean {
  const haystack = `${title} ${description} ${channelName}`.toLowerCase();

  // Avoid filter: if video matches any avoid keyword, block it
  for (const avoid of avoidKeywords) {
    if (!avoid) continue;
    if (haystack.includes(avoid.toLowerCase())) return false;
  }

  // Allow filter: if no keywords at all, allow (first open scenario)
  if (allowKeywords.length === 0) return true;

  // Must match at least one allow keyword
  for (const kw of allowKeywords) {
    if (!kw) continue;
    if (haystack.includes(kw.toLowerCase())) return true;
  }

  return false;
}
