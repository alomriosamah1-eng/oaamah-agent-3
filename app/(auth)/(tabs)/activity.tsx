import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { useI18n } from '@/i18n/provider';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon, Sky, MagentaGlow, Amber } from '@/theme/colors';
import { getChatsWithPreview, getPromptSessionsWithPreview } from '@/utils/Database';
import { getFlowHistory } from '@/utils/flow/flowDB';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';
import { listActivities } from '@/utils/activityLog';

type Activity = { id: string; title: string; detail: string; time: number; icon: keyof typeof MaterialIcons.glyphMap; color: string; route: string };
export default function ActivityScreen() {
  const { colors } = useTheme(); const { t } = useI18n(); const router = useRouter(); const db = useSQLiteContext(); const { top, bottom } = useSafeAreaInsets();
  const [rows, setRows] = useState<Activity[]>([]); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const out: Activity[] = [];
    const [chats, prompts, flow, searches] = await Promise.all([getChatsWithPreview(db).catch(() => []), getPromptSessionsWithPreview(db).catch(() => []), getFlowHistory(db).catch(() => []), listActivities()]);
    chats.forEach(c => out.push({ id: `chat-${c.id}`, title: c.title, detail: c.preview || t('activityLog.chat'), time: c.id, icon: 'chat-bubble', color: Sky, route: `/chat/${c.id}` }));
    prompts.forEach(p => out.push({ id: `prompt-${p.id}`, title: p.title, detail: p.preview || t('activityLog.prompt'), time: p.createdAt || p.id, icon: 'psychology-alt', color: MagentaGlow, route: '/promptMaker' }));
    flow.forEach((f, i) => out.push({ id: `flow-${f.ytId}-${i}`, title: f.ytId, detail: `FLOW · ${f.action}`, time: f.at, icon: 'play-circle', color: Amber, route: '/flow' }));
    searches.forEach(r => out.push({ id: r.id, title: r.title, detail: r.detail, time: r.at, icon: 'search', color: CyanNeon, route: '/search' }));
    out.sort((a,b) => b.time - a.time); setRows(out.slice(0, 120)); setLoading(false);
  }, [db]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingTop: top + 10, paddingBottom: TAB_BAR_HEIGHT + bottom + 24 }}><Pressable onPress={() => router.back()} style={s.back}><MaterialIcons name="arrow-forward" size={21} color={colors.primary} /><Text style={{ color: colors.primary, ...(typography.labelLarge as any) }}>{t('settings.developerPage.back')}</Text></Pressable><View style={s.header}><View style={{ flex: 1 }}><Text style={{ color: colors.onBackground, ...(typography.titleLarge as any), fontWeight: FontWeights.bold }}>{t('activityLog.title')}</Text><Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{t('activityLog.subtitle')}</Text></View><View style={[s.badge, { backgroundColor: withAlpha(CyanNeon, 0.14) }]}><MaterialIcons name="timeline" size={23} color={CyanNeon} /></View></View>{loading ? <ActivityIndicator color={CyanNeon} style={{ marginTop: 40 }} /> : rows.length === 0 ? <View style={s.empty}><MaterialIcons name="history" size={42} color={CyanNeon} /><Text style={{ color: colors.onSurface, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>{t('activityLog.emptyTitle')}</Text><Text style={{ color: colors.onSurfaceVariant, textAlign: 'center' }}>{t('activityLog.emptyText')}</Text></View> : <View style={{ gap: 9, marginTop: 18 }}>{rows.map(row => <Pressable key={row.id} onPress={() => router.push(row.route as any)} style={({ pressed }) => [s.row, { backgroundColor: withAlpha(colors.surfaceVariant, 0.45), borderColor: withAlpha(row.color, 0.28), opacity: pressed ? 0.7 : 1 }]}><View style={[s.icon, { backgroundColor: withAlpha(row.color, 0.16) }]}><MaterialIcons name={row.icon} size={19} color={row.color} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.onSurface, ...(typography.bodyMedium as any), fontWeight: FontWeights.bold }} numberOfLines={1}>{row.title}</Text><Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }} numberOfLines={1}>{row.detail}</Text></View><MaterialIcons name="chevron-left" size={21} color={colors.onSurfaceVariant} /></Pressable>)}</View>}</ScrollView>;
}
const s = StyleSheet.create({ back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, badge: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, row: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 15, borderWidth: 1, padding: 12 }, icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, empty: { alignItems: 'center', gap: 10, paddingVertical: 80 } });
