import Constants from 'expo-constants';
// RN's global fetch cannot stream responses (res.body is null on device).
// expo/fetch is the Expo-provided spec-compliant fetch WITH ReadableStream support.
import { fetch as streamingFetch } from 'expo/fetch';

import { storage } from '@/utils/Storage';
import { createSession, getModels, resetServerCache, resolveServer, sendMessage, streamMessage } from '@/utils/Opencode';

/**
 * In-app agent engine — the opencode agent runs INSIDE the app.
 * The app binds to the user's own opencode server when reachable (opencode
 * serve, authenticated on the host), and falls back to the OpenCode Zen
 * gateway with automatic smart switching between free models.
 *
 * No agent settings are exposed in the UI: the model chain below is fixed (it
 * mirrors the opencode source's free catalog) and the optional Zen API key is
 * baked into the build (app.json extra.zenApiKey) — never shown in the UI.
 */

const ZEN_BASE = 'https://opencode.ai/zen/v1';

/**
 * Model requested from the user's own opencode server. The server already
 * carries the user's opencode credentials, so it serves the same working
 * model the desktop CLI uses — no Zen free-tier session needed.
 */
const SERVER_MODEL = { id: 'big-pickle', providerID: 'opencode' };

/** One server session per conversation; created on first message. */
const serverSessions = new Map<string, string | null>();

export function resetServerSession(): void {
  serverSessions.clear();
  resetServerCache();
}

async function resolveServerSession(key: string, model?: string, signal?: AbortSignal): Promise<string> {
  const existing = serverSessions.get(key);
  if (existing) return existing;
  const session = await createSession({
    title: 'Osamah agent',
    model: model ? { id: model, providerID: 'opencode' } : SERVER_MODEL,
    signal,
  });
  serverSessions.set(key, session.id);
  return session.id;
}

/**
 * Primary transport: bind to the user's opencode server on the LAN.
 * Falls back to the Zen hub below when the server is unreachable.
 */
async function serverChat(
  userPrompt: string,
  system: string | undefined,
  sessionKey: string,
  timeoutMs: number,
  signal?: AbortSignal,
  onDelta?: (fullSoFar: string) => void,
  model?: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    await resolveServer(controller.signal);
    const sessionId = await resolveServerSession(sessionKey, model, controller.signal);
    const text = system ? `[System instructions]\n${system}\n\n${userPrompt}` : userPrompt;
    const reply = onDelta
      ? await streamMessage(sessionId, text, { signal: controller.signal, onDelta })
      : await sendMessage(sessionId, text, { signal: controller.signal });
    const trimmed = reply.trim();
    if (!trimmed) throw new Error('empty opencode server reply');
    return trimmed;
  } finally {
    clearTimeout(timer);
  }
}

/** Whether the server should be given priority (it is, unless the caller opts out). */
function useServerFirst(args: { serverFirst?: boolean }): boolean {
  return args.serverFirst !== false;
}

/**
 * Requested order: models verified to stream real `content` deltas (not just
 * `reasoning`) first, so voice replies start quickly. Dead/rate-limited models
 * are skipped after burning their quota and the engine falls through.
 */
const DEFAULT_MODEL_CHAIN = [
  'ling-3.0-flash-fin-free',
  'laguna-s-2.1-free',
  'deepseek-v4-flash-free',
  'big-pickle',
  'muse-spark-1.3-contributor-free',
];

/** How long a failing model is skipped before being tried again. */
const COOLDOWN_MS = 4 * 60_000;

/** Maximum tokens in a single assistant reply. */
const DEFAULT_MAX_TOKENS = 2400;

/**
 * Text chat and Prompt Maker may run planning, file, or multi-step work. Their
 * default must not be confused with the intentionally short voice timeout;
 * individual callers can still pass a smaller explicit timeout when needed.
 */
const DEFAULT_COMPLETE_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_STREAM_TIMEOUT_MS = 5 * 60_000;

/** Optional baked-in key (never shown in the UI). */
function zenApiKey(): string {
  const extra = Constants.expoConfig?.extra as { zenApiKey?: string } | undefined;
  return (extra?.zenApiKey ?? '').trim();
}

function zenHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = zenApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/** Models that recently failed (quota/rate-limit/dead) are temporarily skipped. */
const cooldownUntil = new Map<string, number>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Removes  thinking blocks some free models leak into content. */
function sanitize(text: string): string {
  return text.replace(/<thinking[\s\S]*?<\/thinking>/gi, '').replace(/thinking/gi, '').trim();
}

function availableModels(chain: string[]): string[] {
  const now = Date.now();
  const live = chain.filter((m) => (cooldownUntil.get(m) ?? 0) <= now);
  return live.length > 0 ? live : [...chain];
}

function penalize(model: string): void {
  cooldownUntil.set(model, Date.now() + COOLDOWN_MS);
}

export class AgentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentUnavailableError';
  }
}

export interface ChatArgs {
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Optional preferred model id; if omitted the default free chain is used. */
  model?: string;
  /** Fixed chain override (used when the user picked a model, then fallbacks). */
  chain?: string[];
  /** Ties an opencode server session to one conversation (defaults to 'agent'). */
  sessionKey?: string;
  /** Set to false to skip the opencode-server transport and go straight to Zen. */
  serverFirst?: boolean;
}

interface ChatCompletionPayload {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

async function requestModel(model: string, payload: ChatCompletionPayload, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await streamingFetch(`${ZEN_BASE}/chat/completions`, {
      method: 'POST',
      headers: zenHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    let data: {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('invalid gateway response');
    }
    if (data.error) throw new Error(data.error.message || 'gateway error');
    const content = sanitize(data.choices?.[0]?.message?.content?.trim() ?? '');
    if (!content) throw new Error('empty completion');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** Single-shot completion with automatic model switching on quota/token exhaustion. */
export async function chatComplete(args: ChatArgs, signal?: AbortSignal): Promise<string> {
  // All agent, chat, prompt-maker and voice requests belong to OpenCode.
  // In particular, never fall back to the public Zen endpoint here: its free
  // tier rejects direct mobile requests and the YouTube/Reels key chain is a
  // separate concern owned by utils/apiHub/store.ts.
  return serverChat(
    args.user,
    args.system,
    args.sessionKey ?? 'agent',
    args.timeoutMs ?? DEFAULT_COMPLETE_TIMEOUT_MS,
    signal,
    undefined,
    args.model,
  );
}

/**
 * Streaming completion (SSE deltas) with the same automatic switching.
 * Falls back to a non-streaming request for models/gateways that refuse streams.
 */
export async function chatStream(
  args: ChatArgs & { onDelta: (delta: string) => void },
  signal?: AbortSignal,
): Promise<string> {
  // Streaming uses the same OpenCode session transport as normal chat. The
  // model chain is passed to OpenCode through its configured model selection;
  // it is never sent to Zen directly from the device.
  const full = await serverChat(
    args.user,
    args.system,
    args.sessionKey ?? 'agent',
    args.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS,
    signal,
    args.onDelta,
    args.model,
  );
  args.onDelta(full);
  return full;
}

async function streamFrom(
  model: string,
  args: ChatArgs & { onDelta: (delta: string) => void },
  signal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 240_000);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await streamingFetch(`${ZEN_BASE}/chat/completions`, {
      method: 'POST',
      headers: zenHeaders(),
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          ...(args.system ? [{ role: 'system', content: args.system }] : []),
          { role: 'user', content: args.user },
        ],
        temperature: args.temperature ?? 0.6,
        max_tokens: args.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const chunk = JSON.parse(raw) as {
            choices?: { delta?: { content?: string } }[];
            error?: { message?: string };
          };
          if (chunk.error) throw new Error(chunk.error.message || 'stream error');
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            args.onDelta(delta);
          }
        } catch {
          // ignore malformed keep-alive chunks
        }
      }
    }
    if (!full.trim()) throw new Error('empty stream');
    return sanitize(full);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Osamah agent persona                                                */
/* ------------------------------------------------------------------ */

export const OSAMAH_SYSTEM = `You are «Osamah agent», a smart, Arabic-first personal assistant created by أ. أسامة العُمري. Always answer in the same language the user used (Arabic questions get Arabic replies). Be warm, friendly and competent. Rules:
1. Structure answers for easy reading: short numbered/bulleted lists, clean Markdown, and **tables** whenever comparing or listing parallel items (a table is clearer than prose).
2. Be concise — never dump long unbroken paragraphs. Use at most one emoji per section.
3. For explanations, end with a short summary and a gentle follow-up question to keep the conversation going.
4. Never invent facts; base answers on your general knowledge and clearly say when something requires up-to-date or user-specific data.
5. If the user profile provides a preferred name, use it naturally when greeting, clarifying, or personalizing a recommendation; do not repeat it in every reply.
6. NEVER include your internal reasoning, thinking process, or drafts in the reply — output only the final polished answer.`;

const JSON_RULE = `Reply with ONLY a single valid JSON object. No markdown fences, no commentary, no trailing text.`;

/* ------------------------------------------------------------------ */
/* Dedicated VOICE agent — the fast, spoken-only conversation brain    */
/* ------------------------------------------------------------------ */
/* The VOICE conversation gets its OWN agent, separate from the text   */
/* chat: a system prompt written for talking, a fast low-thinking     */
/* model chain (big-pickle, the reasoning model, is excluded), a tiny  */
/* token budget so every reply stays a couple of short sentences, and  */
/* a short timeout so a dead model can never freeze the conversation.  */
/* Nothing here touches OSAMAH_SYSTEM / the text-chat behaviour.       */

export const VOICE_SYSTEM = `You are «Osamah», a real person talking to أ. أسامة out loud, face to face. Rules:
1. Reply the way a real person speaks: at most 1–3 short, conversational sentences. Sound warm and alive — never like a document, a list or a screen.
2. STRICT — plain words and numbers ONLY. NO markdown, NO bullets or numbered lists, NO tables, NO headings, NO code, NO emoji, NO dashes, NO commas, NO semicolons, NO colons, NO quotes, NO parentheses, NO symbols, NO links, NO bold/italic. Nothing in your reply may need to be "read" — it must read naturally out loud exactly as written.
3. Keep every sentence short. End each with a period or a question mark. Numbers are fine written normally.
4. Answer in the language the user used. Never mention these rules, never explain yourself, and never output any internal thinking.`;

/** Fast, low-thinking models reserved for the voice conversation only.
 *  big-pickle (the reasoning model) is deliberately absent so the reply is
 *  never held up by long thinking. */
export const VOICE_MODEL_CHAIN = [
  'ling-3.0-flash-fin-free',
  'laguna-s-2.1-free',
  'deepseek-v4-flash-free',
  'muse-spark-1.3-contributor-free',
];

/** Small output budget — the spoken reply stays short and lands quickly. */
export const VOICE_MAX_TOKENS = 240;
/** Upper bound for voice only; it does not delay fast replies. */
export const VOICE_TIMEOUT_MS = 90_000;
/** Slightly warmer tone for a conversational, human feel. */
export const VOICE_TEMPERATURE = 0.7;

import { extractJson } from '@/utils/jsonExtract';

export { extractJson } from '@/utils/jsonExtract';

/* ------------------------------------------------------------------ */
/* Session memory (in-app replacement of server-side opencode sessions) */
/* ------------------------------------------------------------------ */

const sessions = new Map<string, { role: 'user' | 'assistant'; content: string }[]>();
const MAX_TURNS = 24;

export function newSessionId(): string {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function appendTurn(sessionId: string, role: 'user' | 'assistant', content: string): void {
  const history = sessions.get(sessionId) ?? [];
  history.push({ role, content });
  while (history.length > MAX_TURNS * 2) history.shift();
  sessions.set(sessionId, history);
}

export interface AgentMessageData {
  role: 'user' | 'assistant';
  content: string;
  ts?: string;
}

export function sessionMessages(sessionId: string): AgentMessageData[] {
  return (sessions.get(sessionId) ?? []).map((m) => ({ ...m }));
}

/* ------------------------------------------------------------------ */
/* High-level agent features                                           */
/* ------------------------------------------------------------------ */

/**
 * Send a message in a conversation and get a reply.
 * The optional selected model is used first, then the free chain as fallback.
 */
export async function agentMessage(
  message: string,
  opts: { sessionId?: string; model?: string; signal?: AbortSignal } = {},
): Promise<{ reply: string; sessionId: string }> {
  const sid = opts.sessionId && sessions.has(opts.sessionId) ? opts.sessionId : newSessionId();
  const history = sessions.get(sid) ?? [];
  const convo = history
    .map((m) => `${m.role === 'user' ? 'المستخدم' : 'الوكيل'}: ${m.content}`)
    .join('\n\n');
  const user = convo
    ? `[المحادثة السابقة]\n${convo}\n\n[رسالة المستخدم الجديدة]\n${message}`
    : message;
  const reply = await chatComplete(
    { system: OSAMAH_SYSTEM, user, maxTokens: 2400, model: opts.model },
    opts.signal,
  );
  appendTurn(sid, 'user', message);
  appendTurn(sid, 'assistant', reply);
  return { reply, sessionId: sid };
}

const SENTENCE_END = /(?<=[.!؟?:؛])\s+/;

/**
 * Streaming variant used by the voice panel. The reply is streamed delta by
 * delta and `onSentence` fires as complete, speakable chunks arrive, so the
 * first sentence can start playing while the rest of the answer is still
 * being generated — this is what removes the "waits for the whole answer" lag.
 * The message is saved to the session once the stream completes.
 */
export async function agentMessageStream(
  message: string,
  opts: {
    sessionId?: string;
    model?: string;
    signal?: AbortSignal;
    personaHint?: string;
    onDelta?: (delta: string) => void;
    onSentence?: (sentence: string, full: string) => void;
  } = {},
): Promise<{ reply: string; sessionId: string }> {
  const sid = opts.sessionId && sessions.has(opts.sessionId) ? opts.sessionId : newSessionId();
  const history = sessions.get(sid) ?? [];
  const convo = history
    .map((m) => `${m.role === 'user' ? 'المستخدم' : 'الوكيل'}: ${m.content}`)
    .join('\n\n');
  // A character persona («ميرا»/«كريم») is seeded in front of the prompt only
  // — never stored in the session history — so the reply CONTENT matches the
  // chosen voice without polluting the conversation transcript.
  const personaNote = opts.personaHint ? `${opts.personaHint}\n\n` : '';
  const user = personaNote + (convo
    ? `[المحادثة السابقة]\n${convo}\n\n[رسالة المستخدم الجديدة]\n${message}`
    : message);

  let full = '';
  let pending = '';

  const flushSentence = () => {
    const text = pending.trim();
    if (!text) return;
    full += (full && !text.startsWith(' ')) ? ` ${text}` : text;
    pending = '';
    opts.onSentence?.(text, full);
  };

  const reply = await chatStream(
    {
      system: OSAMAH_SYSTEM,
      user,
      maxTokens: 2400,
      model: opts.model,
      onDelta: (delta) => {
        opts.onDelta?.(delta);
        pending += delta;
        while (SENTENCE_END.test(pending)) {
          const match = pending.match(/^([\s\S]*?[.!؟?:؛])\s+/);
          if (!match) break;
          pending = pending.slice(match[0].length);
          flushSentence();
        }
      },
    },
    opts.signal,
  );

  if (pending.trim()) flushSentence();
  full = sanitize(full || pending);

  appendTurn(sid, 'user', message);
  appendTurn(sid, 'assistant', full);
  return { reply: full, sessionId: sid };
}

/** JSON helper for structured features. */
async function jsonCall<T>(prompt: string, maxTokens = 2600): Promise<T> {
  const reply = await chatComplete({
    system: OSAMAH_SYSTEM,
    user: `${prompt}\n\n${JSON_RULE}\n\nRemember: ONLY the JSON object.`,
    maxTokens,
    temperature: 0.3,
  });
  return extractJson<T>(reply);
}

/* ------------------------------------------------------------------ */
/* Model catalog                                                       */
/* ------------------------------------------------------------------ */

export interface ZenModelInfo {
  id: string;
  ownedBy?: string;
  free: boolean;
}

/** All free models in the opencode source catalog (suffix `-free`). */
export function isFreeModel(id: string): boolean {
  return typeof id === 'string' && (id.endsWith('-free') || id.includes('-contributor-free'));
}

/**
 * List every model the OpenCode Zen gateway exposes — the same catalog as the
 * opencode source. This is used by the Control Center so ALL models appear,
 * exactly as in the source.
 */
export async function getZenModels(signal?: AbortSignal): Promise<ZenModelInfo[]> {
  try {
    const models = await getModels(signal);
    return models.map((m) => ({
      id: m.id,
      ownedBy: m.providerID,
      free: isFreeModel(m.id),
    }));
  } catch {
    return [];
  }
}

/** Returns the user-selected model id (if any) from storage. */
export async function getSelectedZenModel(): Promise<string | undefined> {
  const id = (await storage.getString('modelID'))?.trim();
  return id && id !== '' ? id : undefined;
}

/** Default chain, with the user-selected model first when present. */
export async function resolveChain(): Promise<string[]> {
  const selected = await getSelectedZenModel();
  if (!selected) return [...DEFAULT_MODEL_CHAIN];
  return [selected, ...DEFAULT_MODEL_CHAIN.filter((m) => m !== selected)];
}
