import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, DeepViolet, CyanNeon, ElectricBlue, Amber, Green } from '@/theme/colors';
import { Spacer } from '@/theme/primitives';
import { SectionScaffold } from '@/components/SectionScaffold';
import { useI18n } from '@/i18n/provider';
import { useSQLiteContext } from 'expo-sqlite';
import { getStats, DbStats, getPromptSessions } from '@/utils/Database';
import { getFlowHistory, getAllKeywords } from '@/utils/flow/flowDB';

const Page = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const db = useSQLiteContext();
  const [stats, setStats] = useState<DbStats>({ chats: 0, messages: 0, images: 0 });
  const [brain, setBrain] = useState({ prompts: 0, keywords: 0, flow: 0 });

  useEffect(() => {
    let active = true;
    (async () => {
      const [s, prompts, keywords, flow] = await Promise.all([
        getStats(db).catch(() => ({ chats: 0, messages: 0, images: 0 })),
        getPromptSessions(db).catch(() => []),
        getAllKeywords(db).catch(() => []),
        getFlowHistory(db).catch(() => []),
      ]);
      if (active) { setStats(s); setBrain({ prompts: prompts.length, keywords: keywords.length, flow: flow.length }); }
    })();
    return () => { active = false; };
  }, [db]);

  const total = stats.chats + stats.messages + stats.images + brain.prompts + brain.flow;
  return (
    <SectionScaffold title={t('secondBrain.title')} subtitle={t('secondBrain.subtitle')} onBack={() => router.back()}>
      <View style={s.hero}>
        <View style={[s.heroIcon, { backgroundColor: withAlpha(DeepViolet, 0.2) }]}><MaterialIcons name="psychology" size={30} color={DeepViolet} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.onSurface, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>{t('secondBrain.personalCenter')}</Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{t('secondBrain.personalHint')}</Text>
        </View>
      </View>
      <Spacer h={14} />
      <View style={s.grid}>
        <StatTile icon="forum" color={CyanNeon} label={t('secondBrain.chats')} value={stats.chats} />
        <StatTile icon="message" color={ElectricBlue} label={t('secondBrain.messages')} value={stats.messages} />
        <StatTile icon="auto-awesome" color={DeepViolet} label={t('secondBrain.prompts')} value={brain.prompts} />
        <StatTile icon="local-fire-department" color={Amber} label={t('secondBrain.flow')} value={brain.flow} />
      </View>
      <Spacer h={16} />
      <View style={[s.insight, { backgroundColor: withAlpha(colors.surfaceVariant, 0.5), borderColor: withAlpha(colors.outline, 0.25) }]}>
        <MaterialIcons name="insights" size={22} color={Green} />
        <View style={{ flex: 1 }}><Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>{t('secondBrain.insight')}</Text><Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{t('secondBrain.insightText').replace('{total}', String(total)).replace('{keywords}', String(brain.keywords))}</Text></View>
      </View>
      <Spacer h={14} />
      <Pressable onPress={() => router.push('/activity')} style={[s.action, { borderColor: withAlpha(CyanNeon, 0.35), backgroundColor: withAlpha(CyanNeon, 0.1) }]}>
        <MaterialIcons name="timeline" size={21} color={CyanNeon} /><Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold, flex: 1 }}>{t('secondBrain.openActivity')}</Text><MaterialIcons name="chevron-left" size={22} color={colors.onSurfaceVariant} />
      </Pressable>
      <Spacer h={10} />
      <View style={[s.note, { backgroundColor: withAlpha(colors.surfaceVariant, 0.45) }]}><MaterialIcons name="lock" size={18} color={colors.primary} /><Spacer w={10} /><Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any), flex: 1 }}>{t('secondBrain.privacy')}</Text></View>
    </SectionScaffold>
  );
};

function StatTile({ icon, color, label, value }: { icon: keyof typeof MaterialIcons.glyphMap; color: string; label: string; value: number }) {
  const { colors } = useTheme();
  return <View style={[s.tile, { backgroundColor: withAlpha(colors.surfaceVariant, 0.45), borderColor: withAlpha(colors.outline, 0.2) }]}><View style={[s.iconWrap, { backgroundColor: withAlpha(color, 0.16) }]}><MaterialIcons name={icon} size={21} color={color} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{label}</Text><Text style={{ color: colors.onSurface, ...(typography.titleLarge as any), fontWeight: FontWeights.bold }}>{value}</Text></View></View>;
}
const s = StyleSheet.create({ hero: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: 'rgba(91,58,155,0.12)' }, heroIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, tile: { width: '48%', minHeight: 100, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, padding: 12 }, iconWrap: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, insight: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 16, borderWidth: 1, padding: 14 }, action: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, borderWidth: 1, padding: 14 }, note: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 16, padding: 14 } });
export default Page;
