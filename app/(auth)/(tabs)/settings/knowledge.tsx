import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, DeepViolet, CyanNeon, ElectricBlue } from '@/theme/colors';
import { Spacer } from '@/theme/primitives';
import { SectionScaffold } from '@/components/SectionScaffold';
import { useI18n } from '@/i18n/provider';
import { useSQLiteContext } from 'expo-sqlite';
import { getStats, DbStats } from '@/utils/Database';

const Page = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const db = useSQLiteContext();
  const [stats, setStats] = useState<DbStats>({ chats: 0, messages: 0, images: 0 });

  useEffect(() => {
    getStats(db).then(setStats);
  }, []);

  return (
    <SectionScaffold
      title={t('settings.knowledge.title')}
      subtitle={t('settings.knowledge.subtitle')}
      onBack={() => router.back()}>
      <StatTile icon="chat-bubble-outline" color={CyanNeon} label={t('settings.knowledge.chatsLabel')} value={stats.chats} />
      <Spacer h={10} />
      <StatTile icon="message" color={ElectricBlue} label={t('settings.knowledge.messagesLabel')} value={stats.messages} />
      <Spacer h={10} />
      <StatTile icon="image" color={DeepViolet} label={t('settings.knowledge.imagesLabel')} value={stats.images} />

      <Spacer h={18} />
      <View style={[s.note, { backgroundColor: withAlpha(colors.surfaceVariant, 0.5) }]}>
        <MaterialIcons name="lock" size={18} color={colors.primary} />
        <Spacer w={10} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
            {t('settings.knowledge.emptyTitle')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{t('settings.knowledge.emptyBody')}</Text>
        </View>
      </View>
    </SectionScaffold>
  );
};

function StatTile({ icon, color, label, value }: { icon: keyof typeof MaterialIcons.glyphMap; color: string; label: string; value: number }) {
  const { colors } = useTheme();
  return (
    <View style={s.tile}>
      <View style={[s.iconWrap, { backgroundColor: withAlpha(color, 0.16) }]}>
        <MaterialIcons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{label}</Text>
        <Text style={{ color: colors.onSurface, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>{value}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(31,41,55,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: 14,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: 14,
  },
});

export default Page;