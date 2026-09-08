// Prompt Maker — standalone screen, chat-style (mirrors the main osamah AI
// chat interface: bubbles + pinned bottom input + header icons) but scoped to
// Prompt Maker only: no voice buttons, no task-level chips. The prompt is
// streamed live from the opencode server so results appear instantly as they
// are written, then persisted to the module's isolated history.
//
// State is plain local React state (the same proven pattern as ChatPage) —
// no global store subscriptions, so the screen can never drive a render loop.

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { FontAwesome6, MaterialIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n/provider';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';
import { BrandNavTitle } from '@/components/BrandNavTitle';
import ChatMessage from '@/components/ChatMessage';
import { Role } from '@/utils/Interfaces';
import { AgentUnavailableError } from '@/utils/OpenCodeAgent';
import { PromptMakerAgent } from '../agent/PromptMakerAgent';
import { promptMakerLlm } from '../agent/llm-bridge';
import {
  deletePromptRecord,
  initPromptHistory,
  listPromptRecords,
  savePromptRecord,
  updatePromptRecord,
} from '../services/prompt-history';
import { draftFromOutput, makeRecord, recordToOutput, sortByNewest } from '../services/history-core';
import type { PromptRecord, PromptTransformOp } from '../types/prompt-types';
import PromptInput from '../components/PromptInput';
import PromptBubble from '../components/PromptBubble';
import PromptHistoryModal from '../components/PromptHistoryModal';

/** Live-only fence stripping (unterminated opening fence while streaming). */
const livePrompt = (raw: string): string => {
  let s = raw.replace(/^```[a-z0-9_-]*\s*\n?/i, '');
  s = s.replace(/\s*```[a-z0-9_-]*\s*$/i, '').trim();
  return s;
};

const PromptMakerPage = () => {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { bottom } = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [history, setHistory] = useState<PromptRecord[]>([]);
  const [current, setCurrent] = useState<PromptRecord | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [lastRequest, setLastRequest] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [live, setLive] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const agent = useMemo(() => new PromptMakerAgent(promptMakerLlm), []);
  const listRef = useRef<FlatList | null>(null);
  const bottomClearance = TAB_BAR_HEIGHT + bottom + 16;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initPromptHistory(db);
        const records = await listPromptRecords(db);
        if (!cancelled) setHistory(sortByNewest(records));
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const upsertHistory = (record: PromptRecord) => {
    setHistory((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
  };

  const viewerOutput = current ? recordToOutput(current) : null;
  const showBot = live != null || viewerOutput != null;

  const handleError = (err: unknown) => {
    const message =
      err instanceof AgentUnavailableError ? t('promptMaker.errorBody') : `${(err as Error)?.message ?? err}`;
    Alert.alert(t('promptMaker.errorTitle'), message);
  };

  const generate = async (text: string) => {
    if (busy) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setLastRequest(trimmed);
    setInputValue('');
    setLive('');
    setBusy(true);
    try {
      const output = await agent.generate(trimmed, { onPartial: (d) => setLive(d) });
      const draft = draftFromOutput(output, trimmed);
      const id = await savePromptRecord(db, draft);
      const record = makeRecord(draft, undefined, id);
      upsertHistory(record);
      setCurrent(record);
      setLive(null);
    } catch (err) {
      handleError(err);
      setLive(null);
    } finally {
      setBusy(false);
    }
  };

  const openRecord = (record: PromptRecord) => {
    setCurrent(record);
    setLastRequest(record.userRequest);
    setLive(null);
    setHistoryOpen(false);
  };

  const removeRecord = async (record: PromptRecord) => {
    if (record.id == null) return;
    try {
      await deletePromptRecord(db, record.id);
      setHistory((prev) => prev.filter((r) => r.id !== record.id));
      setCurrent((prev) => (prev?.id === record.id ? undefined : prev));
    } catch {
      // ignore
    }
  };

  const transform = async (op: PromptTransformOp) => {
    if (!current || busy) return;
    setLive('');
    setBusy(true);
    try {
      const output = await agent.transform(current.userRequest, current.prompt, op, {
        onPartial: (d) => setLive(d),
      });
      const draft = draftFromOutput(output, current.userRequest);
      const next = { ...current, ...draft, updatedAt: Date.now() };
      upsertHistory(next);
      if (next.id != null) await updatePromptRecord(db, next);
      setCurrent(next);
      setLive(null);
    } catch (err) {
      handleError(err);
      setLive(null);
    } finally {
      setBusy(false);
    }
  };

  const newPrompt = () => {
    setLastRequest('');
    setInputValue('');
    setLive(null);
    setCurrent(undefined);
  };

  const renderMetaRow = () => {
    if (!viewerOutput || busy || live != null) return null;
    return (
      <View style={styles.retryRow}>
        <Pressable
          onPress={() => transform('regenerate')}
          disabled={busy}
          style={({ pressed }) => [styles.actionBtn, { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}>
          <MaterialIcons name="refresh" size={15} color={colors.onSurface} />
          <Text style={{ color: colors.onSurface, fontSize: 13 }}>{t('promptMaker.regenerate')}</Text>
        </Pressable>
      </View>
    );
  };

  const rows: Array<{ user?: string; bot?: string; streaming?: boolean }> = [];
  if (lastRequest) rows.push({ user: lastRequest });
  if (showBot) {
    rows.push({ streaming: live != null, bot: live != null ? livePrompt(live) : viewerOutput!.prompt });
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerTitle: () => <BrandNavTitle suffix="PROMPTS" />,
          headerLeft: () => (
            <Pressable onPress={() => setHistoryOpen(true)} hitSlop={16} style={{ marginLeft: 8 }}>
              <FontAwesome6 name="grip-lines" size={20} color={colors.primary} />
            </Pressable>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4, gap: 12 }}>
              {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
              <Pressable onPress={newPrompt} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <MaterialIcons name="add-comment" size={22} color={colors.primary} />
              </Pressable>
            </View>
          ),
        }}
      />

      <View style={styles.pageInner}>
        {rows.length === 0 && (
          <View style={styles.logoContainer}>
            <Image source={require('@/assets/images/logo-white.png')} style={styles.logo} />
          </View>
        )}
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(_, index) => String(index)}
          renderItem={({ item }) => {
            if (item.user) {
              return <ChatMessage role={Role.User} content={item.user} />;
            }
            return <PromptBubble text={item.bot ?? ''} streaming={item.streaming} />;
          }}
          ListFooterComponent={<View>{renderMetaRow()}</View>}
          contentContainerStyle={{ paddingTop: 30, paddingBottom: bottomClearance + 110 }}
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={70}
        style={[styles.inputOverlay, { bottom: bottomClearance }]}>
        <PromptInput
          onSubmit={generate}
          disabled={busy}
          externalValue={inputValue}
          onExternalValueChange={setInputValue}
        />
      </KeyboardAvoidingView>

      <PromptHistoryModal
        visible={historyOpen}
        records={history}
        activeId={current?.id}
        lang={lang}
        onClose={() => setHistoryOpen(false)}
        onOpen={openRecord}
        onDelete={removeRecord}
        onNewPrompt={newPrompt}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageInner: { flex: 1 },
  logoContainer: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
    borderRadius: 50,
    backgroundColor: '#000',
    borderWidth: 1,
    marginTop: 180,
  },
  logo: { width: 30, height: 30, resizeMode: 'cover' },
  inputOverlay: {
    position: 'absolute',
    left: 0,
    width: '100%',
    paddingHorizontal: 12,
  },
  retryRow: {
    paddingHorizontal: 20,
    paddingTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
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
});

export default PromptMakerPage;