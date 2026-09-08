import MessageInput from '@/components/MessageInput';
import { SPEAK_OUTPUT_KEY, storage } from '@/utils/Storage';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlatList } from 'react-native';
import ChatMessage from '@/components/ChatMessage';
import { Message, Role } from '@/utils/Interfaces';
import MessageIdeas from '@/components/MessageIdeas';
import { addChat, addMessage, getMessages } from '@/utils/Database';
import { useSQLiteContext } from 'expo-sqlite';
import { buildHistoryPrompt } from '@/utils/Opencode';
import { AgentUnavailableError, chatComplete, chatStream, getSelectedZenModel, OSAMAH_SYSTEM } from '@/utils/OpenCodeAgent';
import { BrandNavTitle } from '@/components/BrandNavTitle';
import { archiveToServer, cleanChatMessages, PdfFile, saveConversationAsPdf, saveConversationAsLongPdf, messagesToMarkdown } from '@/utils/Pdf';
import { addSavedFile } from '@/utils/savedFiles';
import { deriveDocumentTitle, sanitizePdfName } from '@/utils/pdfPrint';
import { TaskLevel, taskLevelDirective } from '@/utils/taskLevel';
import { isComplexTask, executeTask } from '@/utils/TaskOrchestrator';
import { isLongDocRequest } from '@/utils/longDocument';
import { buildProfileContext, loadProfile } from '@/utils/UserProfile';
import * as Speech from 'expo-speech';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { withAlpha } from '@/theme/colors';
import { typography, FontWeights } from '@/theme/typography';
import { useI18n } from '@/i18n/provider';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const isPdfRequest = (text: string) => {
  const t = text.toLowerCase();
  return t.includes('pdf') || t.includes('مستند') || t.includes('تصدير');
};

const ChatPage = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { bottom } = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [height, setHeight] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  let { id } = useLocalSearchParams<{ id: string }>();

  const [chatId, _setChatId] = useState(id);
  const chatIdRef = useRef(chatId);
  function setChatId(newId: string) {
    chatIdRef.current = newId;
    _setChatId(newId);
  }

  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const abortRef = useRef<AbortController | null>(null);

  // Fast typewriter for server replies: text starts appearing the moment it
  // arrives and keeps flowing as new frames stream in.
  const streamTextRef = useRef('');
  const revealedRef = useRef(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTicker = () => {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  };

  const feedDelta = (fullSoFar: string) => {
    streamTextRef.current = fullSoFar;
    if (revealedRef.current >= fullSoFar.length) return;
    if (!tickerRef.current) {
      tickerRef.current = setInterval(() => {
        revealedRef.current = Math.min(streamTextRef.current.length, revealedRef.current + 120);
        patchLastBot(streamTextRef.current.slice(0, revealedRef.current));
        if (revealedRef.current >= streamTextRef.current.length) stopTicker();
      }, 24);
    }
  };

  const resetTicker = () => {
    stopTicker();
    streamTextRef.current = '';
    revealedRef.current = 0;
  };

  // Profile context — loaded once, rebuilt on return to chat
  const [profileContext, setProfileContext] = useState('');
  useEffect(() => {
    loadProfile().then((p) => {
      setProfileContext(buildProfileContext(p, 'ar') ?? '');
    });
  }, [id]);

  useEffect(() => {
    if (id) {
      getMessages(db, parseInt(id)).then((res) => {
        setMessages(res);
      });
    }
  }, [id]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopTicker();
    };
  }, []);

  const onLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    setHeight(height / 2);
  };

  // ------------------------------------------------------------------
  // Shared helpers
  // ------------------------------------------------------------------

  const patchLastBot = (content: string) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, content };
      return next;
    });
  };

  const removeEmptyBot = () => {
    setMessages((prev) => prev.filter((m) => !(m.role === Role.Bot && m.content === '')));
  };

  const stripOrchestratorStatus = (text: string): string => {
    return text.replace(/^✂️\s*\n?/, '').trim();
  };

  const buildSystem = (directive: string): string => {
    const parts = [OSAMAH_SYSTEM];
    if (profileContext) {
      parts.push(
        `User profile context (use selectively only when it genuinely adds value — for greetings, tailoring examples, or adjusting complexity; ignore when irrelevant):\n${profileContext}`,
      );
    }
    if (directive) {
      parts.push(directive);
    }
    return parts.join('\n\n');
  };

  // ------------------------------------------------------------------
  // Simple chat (chatStream with streaming)
  // ------------------------------------------------------------------

  const runSimpleChat = async (text: string, directive: string, abort: AbortController) => {
    resetTicker();
    const history = messagesRef.current.filter((m) => m.content && m.content.trim() !== '');
    const effectivePrompt = directive ? `${directive}\n\n${text}` : text;
    const prompt = buildHistoryPrompt(history, effectivePrompt);
    const speakOutput = await storage.getString(SPEAK_OUTPUT_KEY);
    const model = await getSelectedZenModel();

    const reply = await chatStream(
      {
        system: buildSystem(directive),
        user: prompt,
        chain: model ? [model] : undefined,
        sessionKey: id ? `chat-${id}` : 'agent',
        onDelta: (delta) => feedDelta(delta),
      },
      abort.signal,
    );

    if (reply && chatIdRef.current) {
      stopTicker();
      revealedRef.current = reply.length;
      await addMessage(db, parseInt(chatIdRef.current), { content: reply, role: Role.Bot });
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, content: reply };
        return next;
      });
      if (speakOutput === 'true' || speakOutput === '1') {
        Speech.stop();
        Speech.speak(reply.replace(/\s+/g, ' ').trim(), { language: 'ar-SA', rate: 1 });
      }
    } else {
      removeEmptyBot();
    }
  };

  // ------------------------------------------------------------------
  // Complex task orchestration (runs llm calls sequentially, short status)
  // ------------------------------------------------------------------

  const runOrchestrator = async (text: string, abort: AbortController) => {
    const model = await getSelectedZenModel();
    patchLastBot(t('orchestration.planning'));

    const llm: typeof chatComplete = (args, signal) => {
      return chatComplete(
        {
          system: args.system,
          user: args.user,
          temperature: args.temperature,
          maxTokens: args.maxTokens,
          model: args.model ?? model,
          sessionKey: id ? `task-${id}` : 'task',
        },
        signal,
      );
    };

    const result = await executeTask(
      text,
      {
        signal: abort.signal,
        model,
        profileContext,
        onPhase: (_phase, statusText) => {
          if (statusText) patchLastBot(statusText);
        },
      },
      { llm },
    );

    const finalContent = stripOrchestratorStatus(result.finalResult);
    patchLastBot(finalContent);

    if (chatIdRef.current) {
      await addMessage(db, parseInt(chatIdRef.current), { content: finalContent, role: Role.Bot });
    }

    const speakOutput = await storage.getString(SPEAK_OUTPUT_KEY);
    if (speakOutput === 'true' || speakOutput === '1') {
      Speech.stop();
      Speech.speak(finalContent.replace(/\s+/g, ' ').trim(), { language: 'ar-SA', rate: 1 });
    }
  };

  // ------------------------------------------------------------------
  // PDF agent flow (organize content → structured doc → PDF → save)
  // ------------------------------------------------------------------

  const registerPdfFiles = async (files: PdfFile[], baseTitle: string, lang: 'ar' | 'en', chatId?: number) => {
    await Promise.all(
      files.map((f) => {
        const partSuffix =
          f.part && f.total
            ? lang === 'ar'
              ? ` (الجزء ${f.part} من ${f.total})`
              : ` (part ${f.part} of ${f.total})`
            : '';
        const name = `${sanitizePdfName(baseTitle)}${partSuffix}.pdf`;
        return addSavedFile(f.uri, name, 'pdf', { chatId, previewHtml: f.html });
      }),
    );
  };

  const runPdfAgent = async (text: string, abort: AbortController) => {
    patchLastBot(t('pdfDoc.organizing'));
    const lang = text.match(/[\u0600-\u06FF]/) ? 'ar' : 'en';
    const title = deriveDocumentTitle(text, undefined, lang);

    // Pass current conversation to the agent for organization
    const chatRows = messagesRef.current
      .filter((m) => m.content && m.content.trim() !== '')
      .map((m) => ({ role: m.role === Role.User ? 'user' as const : 'bot' as const, content: m.content }));

    const outcome = await saveConversationAsPdf(
      chatRows,
      {
        title,
        lang,
        model: await getSelectedZenModel(),
        signal: abort.signal,
        onStatus: (_phase, label, _current, _total, progress) => {
          const bits: string[] = [];
          if (label) bits.push(label);
          if (progress) bits.push(`${progress.percent}%`, `${Math.round(progress.elapsedMs / 1000)}s`);
          if (bits.length) patchLastBot(bits.join(' • '));
        },
      },
    );

    await registerPdfFiles(outcome.files, title, lang, chatIdRef.current ? parseInt(chatIdRef.current) : undefined);
    await archiveToServer(title, messagesToMarkdown(cleanChatMessages(chatRows)));

    patchLastBot(t('pdfDoc.done'));
  };

  // Long-form PDF agent — same flow as runPdfAgent but builds a sectioned
  // long document (scales to 100/500/1000+ pages) via saveConversationAsLongPdf.
  const runLongPdfAgent = async (text: string, abort: AbortController) => {
    patchLastBot(t('pdfDoc.organizing'));
    const lang = text.match(/[\u0600-\u06FF]/) ? 'ar' : 'en';
    const title = deriveDocumentTitle(text, undefined, lang);

    const chatRows = messagesRef.current
      .filter((m) => m.content && m.content.trim() !== '')
      .map((m) => ({ role: m.role === Role.User ? 'user' as const : 'bot' as const, content: m.content }));

    const outcome = await saveConversationAsLongPdf(
      chatRows,
      {
        title,
        lang,
        model: await getSelectedZenModel(),
        signal: abort.signal,
        onStatus: (phase, label, current, total, progress) => {
          const bits: string[] = [];
          if (label) bits.push(label);
          if (phase === 'writing' && total) bits.push(`${current}/${total}`);
          if (progress) bits.push(`${progress.percent}%`, `${Math.round(progress.elapsedMs / 1000)}s`);
          if (bits.length) patchLastBot(bits.join(' • '));
        },
      },
    );

    await registerPdfFiles(outcome.files, outcome.title || title, lang, chatIdRef.current ? parseInt(chatIdRef.current) : undefined);
    await archiveToServer(title, messagesToMarkdown(cleanChatMessages(chatRows)));

    patchLastBot(t('pdfDoc.done'));
  };

  // ------------------------------------------------------------------
  // Main send handler
  // ------------------------------------------------------------------

  const onShouldSend = async (text: string, taskType?: TaskLevel) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setMessages((prev) => [
      ...prev,
      { role: Role.User, content: trimmed },
      { role: Role.Bot, content: '' },
    ]);

    let chatID = chatIdRef.current;
    try {
      if (!chatID) {
        const res = await addChat(db, trimmed);
        chatID = res.lastInsertRowId.toString();
        setChatId(chatID);
      }
      await addMessage(db, parseInt(chatID), { content: trimmed, role: Role.User });
    } catch (err) {
      Alert.alert(t('chat.saveErrorTitle'), t('chat.saveErrorBody'));
    }

    const abort = new AbortController();
    abortRef.current = abort;
    resetTicker();

    const directive = taskType ? taskLevelDirective(taskType) : '';

    try {
      if (isPdfRequest(trimmed)) {
        if (isLongDocRequest(trimmed)) {
          await runLongPdfAgent(trimmed, abort);
        } else {
          await runPdfAgent(trimmed, abort);
        }
      } else if (isComplexTask(trimmed)) {
        await runOrchestrator(trimmed, abort);
      } else {
        await runSimpleChat(trimmed, directive, abort);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      const message =
        err instanceof AgentUnavailableError
          ? t('chat.errorBody')
          : `${err?.message ?? err}`;
      Alert.alert(t('chat.errorTitle'), message);
      removeEmptyBot();
    } finally {
      abortRef.current = null;
      setIsSending(false);
    }
  };

  // ------------------------------------------------------------------
  // Header PDF button — routes to the agent for current session
  // ------------------------------------------------------------------

  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const isPdfBusyRef = useRef(false);
  const onSharePdf = async () => {
    if (isPdfBusyRef.current) return;
    const rows = messagesRef.current;
    if (rows.length === 0) return;
    isPdfBusyRef.current = true;
    setIsPdfBusy(true);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const chatRows = rows
        .filter((m) => m.content && m.content.trim() !== '')
        .map((m) => ({ role: m.role === Role.User ? 'user' as const : 'bot' as const, content: m.content }));

      const lang = 'ar';
      const title = deriveDocumentTitle(undefined, undefined, lang);

      const outcome = await saveConversationAsPdf(chatRows, {
        title,
        lang,
        signal: abort.signal,
      });
      await registerPdfFiles(outcome.files, outcome.title || title, lang, chatIdRef.current ? parseInt(chatIdRef.current) : undefined);
      await archiveToServer(title, messagesToMarkdown(cleanChatMessages(chatRows)));
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      Alert.alert(t('chat.pdfErrorTitle'), `${t('chat.pdfErrorBody')}: ${err?.message ?? err}`);
    } finally {
      abortRef.current = null;
      isPdfBusyRef.current = false;
      setIsPdfBusy(false);
    }
  };

  const bottomClearance = TAB_BAR_HEIGHT + bottom;

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerTitle: () => <BrandNavTitle suffix="AI" />,
          headerRight: () => (
            <Pressable
              onPress={onSharePdf}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginRight: 4 })}>
              {isPdfBusy ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <MaterialIcons name="picture-as-pdf" size={20} color={colors.onBackground} />
              )}
            </Pressable>
          ),
        }}
      />
      <View style={styles.pageInner} onLayout={onLayout}>
        {messages.length == 0 && (
          <View style={[styles.logoContainer, { marginTop: height / 2 - 100, borderColor: withAlpha(colors.outline, 0.3) }]}>
            <Image source={require('@/assets/images/logo-white.png')} style={styles.image} />
          </View>
        )}
        <FlatList
          data={messages}
          keyExtractor={(_, index) => String(index)}
          renderItem={({ item }) => <ChatMessage {...item} />}
          contentContainerStyle={{ paddingTop: 30, paddingBottom: bottomClearance + 110 }}
          keyboardDismissMode="on-drag"
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={70}
        style={{
          position: 'absolute',
          bottom: bottomClearance,
          left: 0,
          width: '100%',
        }}>
        {messages.length === 0 && <MessageIdeas onSelectCard={(text) => onShouldSend(text)} />}
        <MessageInput onShouldSend={onShouldSend} disabled={isSending} />
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  logoContainer: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
    backgroundColor: '#000',
    borderRadius: 50,
    borderWidth: 1,
  },
  image: {
    width: 30,
    height: 30,
    resizeMode: 'cover',
  },
  page: {
    flex: 1,
  },
  pageInner: {
    flex: 1,
  },
});
export default ChatPage;