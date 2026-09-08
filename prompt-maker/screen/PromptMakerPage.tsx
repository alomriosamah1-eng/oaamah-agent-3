// Prompt Maker — standalone screen. Owns the isolated Prompt Maker module:
// request input → PromptMakerAgent → dedicated history. Nothing outside
// prompt-maker/ is modified; the shared opencode engine is used read-only.
//
// Stack header (headerTitle/headerRight) is provided by the router; this page
// opts into the section branding via <Stack.Screen options> exactly like the
// rest of the app sections do.

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { withAlpha, CyanNeon, MagentaGlow } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { useI18n } from '@/i18n/provider';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';
import { BrandNavTitle } from '@/components/BrandNavTitle';
import { PromptMakerAgent } from '../agent/PromptMakerAgent';
import { promptMakerLlm } from '../agent/llm-bridge';
import { usePromptMakerStore } from '../store/usePromptMakerStore';
import { promptMakerStore } from '../store/prompt-maker-store';
import {
  deletePromptRecord,
  initPromptHistory,
  listPromptRecords,
  savePromptRecord,
  updatePromptRecord,
} from '../services/prompt-history';
import { draftFromOutput, makeRecord, recordToOutput, sortByNewest } from '../services/history-core';
import type { PromptMakerOutput, PromptRecord, PromptTransformOp } from '../types/prompt-types';
import PromptInput from '../components/PromptInput';
import PromptViewer from '../components/PromptViewer';
import PromptHistoryList from '../components/PromptHistoryList';
import { AgentUnavailableError } from '@/utils/OpenCodeAgent';

const PromptMakerPage = () => {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { bottom } = useSafeAreaInsets();
  const db = useSQLiteContext();
  const state = usePromptMakerStore();
  const [request, setRequest] = useState('');
  const [analysis, setAnalysis] = useState<unknown | null>(null);

  const agent = useMemo(() => new PromptMakerAgent(promptMakerLlm), []);
  const bottomClearance = TAB_BAR_HEIGHT + bottom + 24;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initPromptHistory(db);
        const records = await listPromptRecords(db);
        if (!cancelled) promptMakerStore.setHistory(sortByNewest(records));
      } catch {
        // history is best-effort; the section still works without it
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const busy = state.status === 'generating';
  const viewerOutput = state.current ? recordToOutput(state.current) : null;

  const handleError = (err: unknown) => {
    const message =
      err instanceof AgentUnavailableError ? t('promptMaker.errorBody') : `${(err as Error)?.message ?? err}`;
    Alert.alert(t('promptMaker.errorTitle'), message);
  };

  const persist = async (output: PromptMakerOutput, userRequest: string): Promise<PromptRecord> => {
    const draft = draftFromOutput(output, userRequest);
    const id = await savePromptRecord(db, draft);
    const record = makeRecord(draft, undefined, id);
    promptMakerStore.upsertHistory(record);
    return record;
  };

  const generate = async (text: string) => {
    if (busy) return;
    promptMakerStore.setGenerating(true);
    setAnalysis(null);
    try {
      const output = await agent.generate(text);
      const record = await persist(output, text);
      promptMakerStore.setCurrent(record);
    } catch (err) {
      handleError(err);
    } finally {
      promptMakerStore.setGenerating(false);
    }
  };

  const openRecord = (record: PromptRecord) => {
    promptMakerStore.setCurrent(record);
    setRequest(record.userRequest);
    setAnalysis(null);
  };

  const removeRecord = async (record: PromptRecord) => {
    if (record.id == null) return;
    try {
      await deletePromptRecord(db, record.id);
      promptMakerStore.removeFromHistory(record.id);
    } catch {
      // ignore
    }
  };

  const transform = async (op: PromptTransformOp) => {
    const current = state.current;
    if (!current || busy) return;
    promptMakerStore.setGenerating(true);
    setAnalysis(null);
    try {
      const output = await agent.transform(current.userRequest, current.prompt, op);
      const draft = draftFromOutput(output, current.userRequest);
      const next = { ...current, ...draft, updatedAt: Date.now() };
      promptMakerStore.upsertHistory(next);
      if (next.id != null) await updatePromptRecord(db, next);
      promptMakerStore.setCurrent(next);
    } catch (err) {
      handleError(err);
    } finally {
      promptMakerStore.setGenerating(false);
    }
  };

  const runAnalysis = async () => {
    const current = state.current;
    if (!current || busy) return;
    promptMakerStore.setGenerating(true);
    try {
      const a = await agent.analyze(current.prompt);
      setAnalysis({
        score: a.score,
        summary: a.summary,
        strengths: a.strengths,
        suggestions: a.suggestions,
      });
    } catch (err) {
      handleError(err);
    } finally {
      promptMakerStore.setGenerating(false);
    }
  };

  const newRequest = () => {
    setRequest('');
    setAnalysis(null);
    promptMakerStore.setCurrent(undefined);
  };

  const renderAnalysis = () => {
    if (!analysis) return null;
    const a = analysis as { score: number; summary: string; strengths: string[]; suggestions: string[] };
    return (
      <View style={[styles.analysisCard, { borderColor: withAlpha(MagentaGlow, 0.4), backgroundColor: withAlpha(MagentaGlow, 0.06) }]}>
        <View style={styles.analysisHead}>
          <Text style={{ color: MagentaGlow, ...(typography.titleSmall as any) }}>{t('promptMaker.analysisTitle')}</Text>
          <Text style={{ color: MagentaGlow, fontSize: 13, fontWeight: '700' }}>
            {t('promptMaker.scoreLabel')}: {a.score}/100
          </Text>
        </View>
        <Text style={{ color: colors.onSurface, ...(typography.bodyMedium as any) }}>{a.summary}</Text>
        {a.strengths.length > 0 && (
          <View style={{ gap: 2 }}>
            <Text style={{ color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' }}>{t('promptMaker.strengths')}</Text>
            {a.strengths.map((s, i) => (
              <Text key={i} style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>• {s}</Text>
            ))}
          </View>
        )}
        {a.suggestions.length > 0 && (
          <View style={{ gap: 2 }}>
            <Text style={{ color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' }}>{t('promptMaker.suggestions')}</Text>
            {a.suggestions.map((s, i) => (
              <Text key={i} style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>• {s}</Text>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerTitle: () => <BrandNavTitle suffix="PROMPTS" />,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4, gap: 12 }}>
              {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
              <Pressable onPress={newRequest} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <MaterialIcons name="add-comment" size={22} color={colors.primary} />
              </Pressable>
            </View>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomClearance }]}
          keyboardShouldPersistTaps="handled">
          <View style={styles.inputWrap}>
            <PromptInput onSubmit={generate} disabled={busy} externalValue={request} onExternalValueChange={setRequest} />
          </View>

          {viewerOutput && !analysis ? (
            <PromptViewer output={viewerOutput} onTransform={transform} onAnalyze={runAnalysis} disabled={busy} />
          ) : null}

          {analysis ? renderAnalysis() : null}

          {!state.current && !busy && (
            <View style={[styles.empty, { borderColor: withAlpha(colors.outline, 0.3) }]}>
              <Image source={require('@/assets/images/logo-white.png')} style={styles.logo} />
              <Text style={{ color: colors.onSurfaceVariant, textAlign: 'center', ...(typography.bodyMedium as any) }}>
                {t('promptMaker.chatEmpty')}
              </Text>
            </View>
          )}

          {busy && !state.current ? (
            <View style={[styles.empty, { borderColor: withAlpha(CyanNeon, 0.4) }]}>
              <ActivityIndicator color={CyanNeon} />
              <Text style={{ color: CyanNeon, fontSize: 13 }}>{t('promptMaker.sending')}</Text>
            </View>
          ) : null}

          <PromptHistoryList
            records={state.history}
            activeId={state.current?.id}
            lang={lang}
            onOpen={openRecord}
            onDelete={removeRecord}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 16,
  },
  inputWrap: { gap: 8 },
  empty: {
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 20,
  },
  logo: { width: 40, height: 40, borderRadius: 40, backgroundColor: '#000' },
  analysisCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  analysisHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});

export default PromptMakerPage;