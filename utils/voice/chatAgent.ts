// The voice loop's agent that routes every spoken turn INTO the chat
// conversation: the transcript is persisted as a real user message, the reply
// is streamed through the exact same path the chat screen uses (`chatStream`
// + history prompt + Osamah persona), the assistant message is persisted, and
// the opencode server session is tied to the chat id — so the orb session,
// the chat history and subsequent text turns all share one conversation.

import type { SQLiteDatabase } from 'expo-sqlite';
import { addChat, addMessage, getChats, getMessages } from '@/utils/Database';
import { buildHistoryPrompt } from '@/utils/Opencode';
import {
  chatStream,
  VOICE_SYSTEM,
  VOICE_MODEL_CHAIN,
  VOICE_MAX_TOKENS,
  VOICE_TIMEOUT_MS,
  VOICE_TEMPERATURE,
} from '@/utils/OpenCodeAgent';
import { Role } from '@/utils/Interfaces';
import { storage } from '@/utils/Storage';

/** Where the orb remembers which chat its conversation lives in. */
const VOICE_CHAT_KEY = 'voiceLastChatId';

export interface ChatVoiceAgentOptions {
  db: SQLiteDatabase;
  /** Build the system prompt; defaults to the chat persona. */
  buildSystem?: () => Promise<string>;
  /** Force a brand-new chat instead of resuming the last one. */
  fresh?: boolean;
}

/**
 * Mirror the chat screen's persona: Osamah system prompts + the user profile
 * context, so voice replies behave exactly like text replies in the chat.
 */
export async function buildChatSystem(): Promise<string> {
  const { loadProfile, buildProfileContext } = await import('@/utils/UserProfile');
  const ctx = buildProfileContext(await loadProfile(), 'ar') ?? '';
  if (!ctx) return VOICE_SYSTEM;
  return [
    VOICE_SYSTEM,
    'User profile context (use selectively only when it genuinely adds value — for greetings, tailoring examples, or adjusting complexity; ignore when irrelevant):',
    ctx,
  ].join('\n\n');
}

/**
 * One chat-backed agent per orb session — and the SAME chat across sessions.
 * The very first spoken utterance creates a chat; everything after resumes it
 * (verified to still exist), so stopping the loop and re-opening it later, or
 * even restarting the app, keeps talking to the same conversation until the
 * user deletes that chat or explicitly starts a fresh one.
 */
export function createChatVoiceAgent(opts: ChatVoiceAgentOptions) {
  let chatId: number | null = null;
  let systemPromise: Promise<string> | null = null;
  const system = (): Promise<string> => {
    if (!systemPromise) {
      systemPromise = (opts.buildSystem ? opts.buildSystem() : Promise.resolve(VOICE_SYSTEM)).catch(
        () => VOICE_SYSTEM,
      );
    }
    return systemPromise;
  };

  async function ensureChat(firstMessage: string): Promise<number> {
    if (chatId != null) return chatId;
    if (!opts.fresh) {
      const stored = await storage.getString(VOICE_CHAT_KEY).catch(() => null);
      const storedId = stored != null ? Number(stored) : NaN;
      if (Number.isFinite(storedId) && storedId > 0) {
        const exists = (await getChats(opts.db).catch(() => [] as any[])).some(
          (c: { id: number }) => c.id === storedId,
        );
        if (exists) {
          chatId = storedId;
          return chatId;
        }
      }
    }
    const res = await addChat(opts.db, firstMessage);
    chatId = res.lastInsertRowId;
    await storage.set(VOICE_CHAT_KEY, String(chatId)).catch(() => {});
    return chatId;
  }

  async function chatVoiceAgent(
    text: string,
    agentOpts: {
      sessionId?: string;
      model?: string;
      signal?: AbortSignal;
      personaHint?: string;
      onDelta: (delta: string) => void;
    },
  ): Promise<{ reply: string; sessionId: string }> {
    const trimmed = text.trim();
    const chatIdResolved = await ensureChat(trimmed || 'voice note');
    if (!trimmed) return { reply: '', sessionId: `chat-${chatIdResolved}` };

    // Persist the user turn, then build the same history prompt the chat
    // screen feeds the model (assistant + user rows, in order). Cap the
    // window so a conversation that has been resumed for a long time never
    // drags the first reply — the model only needs the recent thread.
    await addMessage(opts.db, chatIdResolved, { role: Role.User, content: trimmed });
    const history = (await getMessages(opts.db, chatIdResolved))
      .filter((m) => m.content && m.content.trim() !== '')
      .slice(-30);
    // A character persona seeded in front of the prompt steers the reply's
    // content (mira/karim) without polluting the persisted transcript — the
    // original text is what gets saved above.
    const prompt =
      (agentOpts.personaHint ? `${agentOpts.personaHint}\n\n` : '') +
      buildHistoryPrompt(history, trimmed);

    // The voice reply rides the DEDICATED voice agent: the fast flash chain
    // (never the local reasoning server), a short token budget so the reply
    // ends quickly and is then spoken whole, and a short timeout so a dead
    // model can never freeze the conversation.
    const reply = await chatStream(
      {
        system: await system(),
        user: prompt,
        serverFirst: false,
        chain: VOICE_MODEL_CHAIN,
        maxTokens: VOICE_MAX_TOKENS,
        temperature: VOICE_TEMPERATURE,
        timeoutMs: VOICE_TIMEOUT_MS,
        sessionKey: `chat-${chatIdResolved}`,
        onDelta: (delta) => agentOpts.onDelta?.(delta),
      },
      agentOpts.signal,
    );

    // Persist the assistant reply so the conversation continues in-chat.
    await addMessage(opts.db, chatIdResolved, { role: Role.Bot, content: reply });
    return { reply, sessionId: `chat-${chatIdResolved}` };
  }

  return chatVoiceAgent;
}