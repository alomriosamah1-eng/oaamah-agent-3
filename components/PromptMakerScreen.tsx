import MessageInput from '@/components/MessageInput';
import ChatMessage from '@/components/ChatMessage';
import { Message, Role } from '@/utils/Interfaces';
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FontAwesome6 } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/theme/theme';
import { withAlpha, CyanNeon, Amber, MagentaGlow, EmeraldGlow, Red } from '@/theme/colors';
import { typography, FontWeights } from '@/theme/typography';
import { useI18n } from '@/i18n/provider';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import {
  addPromptMessage,
  addPromptSession,
  getPromptMessages,
} from '@/utils/Database';
import {
  analyzePrompt,
  buildPrompt,
  BuiltPrompt,
  transformPrompt,
} from '@/utils/PromptMaker';
import { AgentUnavailableError } from '@/utils/OpenCodeAgent';
import { PromptSessionMenuHost } from '@/components/PromptSessionMenu';
import { BrandNavTitle } from '@/components/BrandNavTitle';

const INTENT_ICON: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  coding: 'code',
  research: 'travel-explore',
  agent: 'android',
  rag: 'storage',
  writing: 'edit',
  analysis: 'bar-chart',
  creative: 'palette',
  general: 'chat',
};

const INTENT_COLOR: Record<string, string> = {
  coding: CyanNeon,
  research: '#38BDF8',
  agent: MagentaGlow,
  rag: '#A78BFA',
  writing: Amber,
  analysis: EmeraldGlow,
  creative: '#F472B6',
  general: '#94A3B8',
};

const qualityColor = (score: number) => (score >= 80 ? EmeraldGlow : score >= 50 ? Amber : Red);

const PromptMakerScreen = () => {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { bottom } = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [height, setHeight] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [built, setBuilt] = useState<BuiltPrompt | null>(null);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const requestRef = useRef('');
  const sessionIdRef = useRef<number | null>(null);
  const bottomClearance = TAB_BAR_HEIGHT + bottom;

  const onLayout = (event: any) => {
    setHeight(event.nativeEvent.layout.height / 2);
  };

  // ── Session lifecycle ────────────────────────────────────────────────

  const createSession = async () => {
    const now = new Date();
    const label = now.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
    const title = lang === 'ar' ? `جلسة ${label}` : `Session ${label}`;
    const res = await addPromptSession(db, title);
    const id = res.lastInsertRowId;
    setSessionId(id);
    sessionIdRef.current = id;
    setMessages([]);
    setBuilt(null);
  };

  const loadSession = async (id: number) => {
    const dbMessages = await getPromptMessages(db, id);
    setSessionId(id);
    sessionIdRef.current = id;
    setMessages(dbMessages);
    setBuilt(null);
  };

  // ── DB helpers ───────────────────────────────────────────────────────

  const persistMessage = async (content: string, role: Role) => {
    if (sessionIdRef.current == null) return;
    await addPromptMessage(db, sessionIdRef.current, { content, role });
  };

  // ── Patch / clear helpers ────────────────────────────────────────────

  const patchLastBot = (content: string) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, content };
      return next;
    });
  };

  const handleError = (err: any) => {
    if (err?.name === 'AbortError') return;
    const message = err instanceof AgentUnavailableError ? t('promptMaker.errorBody') : `${err?.message ?? err}`;
    Alert.alert(t('promptMaker.errorTitle'), message);
    setMessages((prev) => prev.filter((m) => !(m.role === Role.Bot && m.content === '')));
  };

  // ── Build / transform / analyze ──────────────────────────────────────

  const create = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    requestRef.current = trimmed;
    setBusy(true);
    setCopied(false);
    setMessages((prev) => [
      ...prev,
      { role: Role.User, content: trimmed },
      { role: Role.Bot, content: '' },
    ]);
    // Lazily create the session on the first real send, so the history only
    // ever contains actual conversations (never empty auto-created ones).
    if (sessionIdRef.current == null) {
      await createSession();
    }
    await persistMessage(trimmed, Role.User);
    try {
      const result = await buildPrompt(trimmed);
      setBuilt(result);
      patchLastBot(result.prompt);
      await persistMessage(result.prompt, Role.Bot);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const transform = async (op: 'regenerate' | 'improve' | 'shorten' | 'expand') => {
    if (!built || busy) return;
    setBusy(true);
    try {
      const result = await transformPrompt(requestRef.current, built.prompt, op);
      setBuilt(result);
      patchLastBot(result.prompt);
      await persistMessage(result.prompt, Role.Bot);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const runAnalysis = async () => {
    if (!built || busy) return;
    setBusy(true);
    try {
      const a = await analyzePrompt(built.prompt);
      const summary =
        built.lang === 'ar'
          ? `[تحليل] الدرجة ${a.score}/100\n\n${a.summary}\n\nنقاط قوة:\n${a.strengths.map((x) => `• ${x}`).join('\n')}\n\nتحسينات:\n${a.suggestions.map((x) => `• ${x}`).join('\n')}`
          : `[Analysis] Score ${a.score}/100\n\n${a.summary}\n\nStrengths:\n${a.strengths.map((x) => `• ${x}`).join('\n')}\n\nImprovements:\n${a.suggestions.map((x) => `• ${x}`).join('\n')}`;
      setMessages((prev) => [...prev, { role: Role.Bot, content: summary }]);
      await persistMessage(summary, Role.Bot);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!built) return;
    await Clipboard.setStringAsync(built.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Menu actions ─────────────────────────────────────────────────────

  const openSession = (id: number) => {
    loadSession(id);
  };

  const newSession = () => {
    createSession();
  };

  // ── Intent helpers ───────────────────────────────────────────────────

  const typeText = (id: string) => {
    const txt = t(`promptMaker.types.${id}` as any);
    return txt.startsWith('promptMaker.types.') ? id : txt;
  };

  // ── Action meta row (rendered just under latest prompt bubble) ───────

  const renderMetaRow = (index: number) => {
    if (!built || index !== messages.length - 1) return null;
    return (
      <View style={styles.metaRow}>
        <View style={[styles.tag, { borderColor: withAlpha(INTENT_COLOR[built.intent] ?? CyanNeon, 0.55), backgroundColor: withAlpha(INTENT_COLOR[built.intent] ?? CyanNeon, 0.12) }]}>
          <MaterialIcons name={INTENT_ICON[built.intent] ?? 'chat'} size={13} color={INTENT_COLOR[built.intent] ?? CyanNeon} />
          <Text style={{ color: INTENT_COLOR[built.intent] ?? CyanNeon, fontSize: 12, fontWeight: '600' }}>{typeText(built.intent)}</Text>
        </View>
        <View style={[styles.tag, { borderColor: withAlpha(qualityColor(built.quality.score), 0.55), backgroundColor: withAlpha(qualityColor(built.quality.score), 0.1) }]}>
          <Text style={{ color: qualityColor(built.quality.score), fontSize: 12, fontWeight: '700' }}>
            {t('promptMaker.quality')}: {built.quality.score}/100
          </Text>
        </View>
        <Pressable
          onPress={copy}
          hitSlop={8}
          style={({ pressed }) => [styles.tag, { borderColor: withAlpha(CyanNeon, 0.55), backgroundColor: withAlpha(CyanNeon, 0.12), opacity: pressed ? 0.7 : 1 }]}>
          <MaterialIcons name={copied ? 'check' : 'content-copy'} size={13} color={CyanNeon} />
          <Text style={{ color: CyanNeon, fontSize: 12, fontWeight: '600' }}>{copied ? t('promptMaker.copied') : t('promptMaker.copy')}</Text>
        </Pressable>
        <View style={styles.actionRow}>
          <Pressable onPress={() => transform('regenerate')} disabled={busy} style={({ pressed }) => [styles.actionBtn, { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}>
            <MaterialIcons name="refresh" size={15} color={colors.onSurface} />
            <Text style={{ color: colors.onSurface, fontSize: 13 }}>{t('promptMaker.regenerate')}</Text>
          </Pressable>
          <Pressable onPress={() => transform('improve')} disabled={busy} style={({ pressed }) => [styles.actionBtn, { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}>
            <MaterialIcons name="trending-up" size={15} color={colors.onSurface} />
            <Text style={{ color: colors.onSurface, fontSize: 13 }}>{t('promptMaker.improve')}</Text>
          </Pressable>
          <Pressable onPress={() => transform('shorten')} disabled={busy} style={({ pressed }) => [styles.actionBtn, { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}>
            <MaterialIcons name="remove-circle-outline" size={15} color={colors.onSurface} />
            <Text style={{ color: colors.onSurface, fontSize: 13 }}>{t('promptMaker.shorten')}</Text>
          </Pressable>
          <Pressable onPress={() => transform('expand')} disabled={busy} style={({ pressed }) => [styles.actionBtn, { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}>
            <MaterialIcons name="add-circle-outline" size={15} color={colors.onSurface} />
            <Text style={{ color: colors.onSurface, fontSize: 13 }}>{t('promptMaker.expand')}</Text>
          </Pressable>
          <Pressable onPress={runAnalysis} disabled={busy} style={({ pressed }) => [styles.actionBtn, styles.analyzeBtn, { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}>
            <MaterialIcons name="speed" size={15} color={MagentaGlow} />
            <Text style={{ color: MagentaGlow, fontSize: 13 }}>{t('promptMaker.analyze')}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerTitle: () => <BrandNavTitle suffix="PROMPTS" />,
          headerLeft: () => (
            <Pressable
              onPress={() => setMenuOpen(true)}
              hitSlop={16}
              style={{ marginLeft: 8 }}>
              <FontAwesome6 name="grip-lines" size={20} color={colors.primary} />
            </Pressable>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4, gap: 12 }}>
              {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
              <Pressable
                onPress={newSession}
                hitSlop={10}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <MaterialIcons name="add-comment" size={22} color={colors.primary} />
              </Pressable>
            </View>
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
          renderItem={({ item, index }) => (
            <View>
              <ChatMessage {...item} />
              {renderMetaRow(index)}
            </View>
          )}
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
        <MessageInput onShouldSend={create} disabled={busy} />
      </KeyboardAvoidingView>

      <PromptSessionMenuHost
        menuOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenSession={openSession}
        onNewSession={newSession}
        activeId={sessionId}
      />
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
  page: { flex: 1 },
  pageInner: { flex: 1 },
  metaRow: {
    paddingHorizontal: 16,
    paddingTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(31,41,55,0.5)',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  analyzeBtn: { borderColor: 'rgba(255,0,128,0.5)', backgroundColor: 'rgba(255,0,128,0.1)' },
});

export default PromptMakerScreen;