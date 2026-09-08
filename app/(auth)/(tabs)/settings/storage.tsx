// إدارة التخزين — صفحة تنظيف نطاق المستخدم فقط.
//
// Show a real on-device footprint of the user's data (donut + legend), a
// one-tap temp-cache cleaner, and a destructive "تهيئة وحذف" section whose
// actions are confirmed via Alert before running. IMPORTANT: none of these
// actions touch connection, keys, settings or system tables (see
// utils/StorageMaintenance.ts + STORAGE_MANAGEMENT.md).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, Red, Green, CyanNeon, RedLight } from '@/theme/colors';
import { Spacer, Divider } from '@/theme/primitives';
import { SectionScaffold } from '@/components/SectionScaffold';
import { StorageDonut, CATEGORY_COLORS } from '@/components/StorageDonut';
import { useI18n, TKey } from '@/i18n/provider';
import { useSQLiteContext } from 'expo-sqlite';
import {
  bytesLabel,
  cleanTemp,
  clearKnowledge,
  clearProfileData,
  clearRecords,
  clearSavedFiles,
  clearSavedVideos,
  computeStorageBreakdown,
  factoryReset,
  freedBytes,
  type StorageBreakdown,
  type StorageCategoryId,
} from '@/utils/StorageMaintenance';

interface CategoryMeta {
  id: StorageCategoryId;
  icon: keyof typeof MaterialIcons.glyphMap;
  labelKey: string;
  hintKey: string;
}

const CATEGORY_META: CategoryMeta[] = [
  { id: 'knowledge', icon: 'psychology', labelKey: 'settings.storage.catKnowledge', hintKey: 'settings.storage.catKnowledgeHint' },
  { id: 'videos', icon: 'play-circle', labelKey: 'settings.storage.catVideos', hintKey: 'settings.storage.catVideosHint' },
  { id: 'saved', icon: 'folder', labelKey: 'settings.storage.catSaved', hintKey: 'settings.storage.catSavedHint' },
  { id: 'records', icon: 'history', labelKey: 'settings.storage.catRecords', hintKey: 'settings.storage.catRecordsHint' },
  { id: 'profile', icon: 'person', labelKey: 'settings.storage.catProfile', hintKey: 'settings.storage.catProfileHint' },
  { id: 'cache', icon: 'delete-sweep', labelKey: 'settings.storage.catCache', hintKey: 'settings.storage.catCacheHint' },
];

const Page = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const db = useSQLiteContext();

  const [breakdown, setBreakdown] = useState<StorageBreakdown | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [freedMsg, setFreedMsg] = useState<string | null>(null);

  const breakdownRef = useRef<StorageBreakdown | null>(null);
  breakdownRef.current = breakdown;

  const refresh = useCallback(async () => {
    const next = await computeStorageBreakdown(db);
    setBreakdown(next);
  }, [db]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const announceFreed = (before: StorageBreakdown, after: StorageBreakdown, ids: readonly StorageCategoryId[]) => {
    const freed = freedBytes(before, after, ids);
    const label = freed > 0 ? t('settings.storage.freedPrefix') : t('settings.storage.cleanedAlready');
    setFreedMsg(`${label} ${bytesLabel(freed)}`);
  };

  const runPlan = async (
    plan: string,
    op: () => Promise<unknown>,
    ids: readonly StorageCategoryId[],
    doneBody: string
  ) => {
    if (busy) return;
    setBusy(plan);
    setFreedMsg(null);
    try {
      const before = breakdownRef.current ?? (await computeStorageBreakdown(db));
      await op();
      const after = await computeStorageBreakdown(db);
      setBreakdown(after);
      announceFreed(before, after, ids);
      Alert.alert(t('settings.storage.done'), doneBody);
    } catch (e) {
      Alert.alert(t('settings.storage.errorTitle'), (e as Error)?.message ?? t('settings.storage.errorBody'));
    } finally {
      setBusy(null);
    }
  };

  const confirm = (body: string, plan: string, op: () => Promise<unknown>, ids: readonly StorageCategoryId[], doneBody: string) => {
    Alert.alert(t('settings.storage.confirmTitle'), body, [
      { text: t('chat.cancel'), style: 'cancel' },
      { text: t('settings.storage.deleteLabel'), style: 'destructive', onPress: () => runPlan(plan, op, ids, doneBody) },
    ]);
  };

  const quickClean = () =>
    runPlan('temp', () => cleanTemp(db), ['cache'], t('settings.storage.quickCleanDoneBody'));

  const proxy = (fn: (db: any) => Promise<unknown>) => () => fn(db);
  const removeProfile = proxy(clearProfileData);

  const resetRows = [
    {
      ...CATEGORY_META.find((c) => c.id === 'profile')!,
      run: () => confirm(t('settings.storage.confirmBody'), 'profile', removeProfile, ['profile'], t('settings.storage.profileDoneBody')),
    },
    {
      ...CATEGORY_META.find((c) => c.id === 'knowledge')!,
      run: () => confirm(t('settings.storage.confirmBody'), 'knowledge', proxy(clearKnowledge), ['knowledge', 'records'], t('settings.storage.knowledgeDoneBody')),
    },
    {
      ...CATEGORY_META.find((c) => c.id === 'records')!,
      run: () => confirm(t('settings.storage.confirmBody'), 'records', proxy(clearRecords), ['records'], t('settings.storage.recordsDoneBody')),
    },
    {
      ...CATEGORY_META.find((c) => c.id === 'videos')!,
      run: () => confirm(t('settings.storage.confirmBody'), 'videos', proxy(clearSavedVideos), ['videos'], t('settings.storage.videosDoneBody')),
    },
    {
      ...CATEGORY_META.find((c) => c.id === 'saved')!,
      run: () => confirm(t('settings.storage.confirmBody'), 'saved', proxy(clearSavedFiles), ['saved'], t('settings.storage.savedDoneBody')),
    },
  ];

  const doFactoryReset = () => {
    Alert.alert(t('settings.storage.factoryTitle'), t('settings.storage.factoryBody'), [
      { text: t('chat.cancel'), style: 'cancel' },
      {
        text: t('settings.storage.factoryConfirm'),
        style: 'destructive',
        onPress: () => runPlan('reset', () => factoryReset(db), CATEGORY_META.map((c) => c.id), t('settings.storage.factoryDoneBody')),
      },
    ]);
  };

  const busyNow = busy !== null;
  const total = breakdown?.totalBytes ?? 0;

  return (
    <SectionScaffold title={t('settings.storage.title')} subtitle={t('settings.storage.subtitle')} onBack={() => router.back()}>
      {!breakdown ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <>
          <StorageDonut breakdown={breakdown} accent={t('settings.storage.totalLabel')} />
          <Spacer h={6} />

          {freedMsg ? (
            <View style={[s.freed, { backgroundColor: withAlpha(Green, 0.14), borderColor: withAlpha(Green, 0.4) }]}>
              <MaterialIcons name="check-circle" size={16} color={Green} />
              <Text style={[s.freedText, { color: Green }]}>{freedMsg}</Text>
            </View>
          ) : null}

          <Spacer h={14} />
          <View style={s.legend}>
            {breakdown.categories.map((c) => (
              <View key={c.id} style={s.legendRow}>
                <View style={[s.dot, { backgroundColor: CATEGORY_COLORS[c.id] }]} />
                <Text style={[s.legendLabel, { color: colors.onSurfaceVariant }]}>{t(`settings.storage.cat${capId(c.id)}` as TKey)}</Text>
                <Text style={[s.legendValue, { color: colors.onSurface }]}>
                  {bytesLabel(c.bytes)} · {c.count} {t('settings.storage.countUnit')}
                </Text>
              </View>
            ))}
          </View>

          <Spacer h={18} />
          <View style={[s.quickClean, { borderColor: withAlpha(CyanNeon, 0.35), backgroundColor: withAlpha(CyanNeon, 0.08) }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
                {t('settings.storage.quickCleanTitle')}
              </Text>
              <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>
                {t('settings.storage.quickCleanHint')}
              </Text>
            </View>
            <Pressable
              disabled={busyNow}
              onPress={quickClean}
              style={({ pressed }) => [s.quickBtn, { backgroundColor: CyanNeon, opacity: busyNow ? 0.5 : pressed ? 0.85 : 1 }]}>
              {busy === 'temp' ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <MaterialIcons name="cleaning-services" size={18} color="#000000" />
              )}
              <Text style={[s.quickBtnText, { color: '#000000' }]}>{t('settings.storage.quickCleanButton')}</Text>
            </Pressable>
          </View>

          <Spacer h={24} />
          <Text style={{ color: colors.onSurface, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>
            {t('settings.storage.destructiveTitle')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{t('settings.storage.destructiveSubtitle')}</Text>
          <Spacer h={12} />

          <View style={{ gap: 10 }}>
            {resetRows.map((row) => (
              <Pressable key={row.id} disabled={busyNow} onPress={row.run} style={({ pressed }) => [s.row, { opacity: busyNow ? 0.6 : pressed ? 0.75 : 1 }]}>
                <View style={[s.rowIcon, { backgroundColor: withAlpha(row.id === 'profile' ? Red : CATEGORY_COLORS[row.id], 0.14) }]}>
                  <MaterialIcons name={row.icon} size={20} color={CATEGORY_COLORS[row.id]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
                    {t(row.labelKey as TKey)}
                  </Text>
                  <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{t(row.hintKey as TKey)}</Text>
                </View>
                {busy === row.id ? (
                  <ActivityIndicator size="small" color={Red} />
                ) : (
                  <MaterialIcons name="delete-outline" size={22} color={withAlpha(Red, 0.9)} />
                )}
              </Pressable>
            ))}
          </View>

          <Spacer h={22} />
          <Divider />
          <Spacer h={22} />

          <Pressable
            disabled={busyNow}
            onPress={doFactoryReset}
            style={({ pressed }) => [s.factory, { backgroundColor: Red, opacity: busyNow ? 0.6 : pressed ? 0.85 : 1 }]}>
            {busy === 'reset' ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialIcons name="restart-alt" size={20} color="#FFFFFF" />}
            <Text style={[s.factoryText, { color: '#FFFFFF' }]}>{t('settings.storage.factoryTitle')}</Text>
          </Pressable>
          <Text style={[s.factoryHint, { color: colors.onSurfaceVariant }]}>{t('settings.storage.factoryHint')}</Text>

          <Spacer h={18} />
          <View style={[s.note, { backgroundColor: withAlpha(RedLight, 0.08), borderColor: withAlpha(RedLight, 0.25) }]}>
            <MaterialIcons name="shield" size={16} color={colors.onSurfaceVariant} />
            <Text style={[s.noteText, { color: colors.onSurfaceVariant }]}>{t('settings.storage.safeNote')}</Text>
          </View>
        </>
      )}
    </SectionScaffold>
  );
};

function capId(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

const s = StyleSheet.create({
  center: { paddingVertical: 48, alignItems: 'center' },
  freed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  freedText: { ...(typography.labelMedium as any), fontWeight: FontWeights.bold },
  legend: { gap: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, ...(typography.bodySmall as any) },
  legendValue: { ...(typography.labelSmall as any), fontWeight: FontWeights.medium },
  quickClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickBtnText: { ...(typography.labelLarge as any), fontWeight: FontWeights.bold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(31,41,55,0.5)',
    padding: 12,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  factory: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
  },
  factoryText: { ...(typography.titleSmall as any), fontWeight: FontWeights.bold },
  factoryHint: { textAlign: 'center', marginTop: 8, ...(typography.bodySmall as any) },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  noteText: { flex: 1, ...(typography.bodySmall as any) },
});

export default Page;