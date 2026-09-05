import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon } from '@/theme/colors';
import { Spacer, Divider } from '@/theme/primitives';
import { SectionScaffold } from '@/components/SectionScaffold';
import { useI18n } from '@/i18n/provider';
import Constants from 'expo-constants';

const Page = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <SectionScaffold
      title={t('settings.about.title')}
      subtitle={t('settings.about.subtitle')}
      onBack={() => router.back()}>
      <View style={s.logoRow}>
        <View style={s.logoWrap}>
          <MaterialIcons name="android" size={28} color={CyanNeon} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.onSurface, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>
            {t('appName')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{t('appSubtitle')}</Text>
        </View>
      </View>

      <Spacer h={18} />
      <Divider />
      <Spacer h={8} />

      <InfoRow icon="info" label={t('settings.about.version')} value={version} />
      <InfoRow icon="code" label={t('settings.about.builtWith')} value={t('settings.about.opencodeNote')} multiline />

      <Spacer h={8} />
      <Divider />
      <Spacer h={14} />

      <View style={s.localCard}>
        <MaterialIcons name="lock" size={18} color={colors.primary} />
        <Spacer w={10} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
            {t('settings.about.local')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{t('settings.about.localHint')}</Text>
        </View>
      </View>
    </SectionScaffold>
  );
};

function InfoRow({ icon, label, value, multiline = false }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; value: string; multiline?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={s.infoRow}>
      <MaterialIcons name={icon} size={18} color={colors.onSurfaceVariant} />
      <Spacer w={10} />
      <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodyMedium as any), width: 110 }}>{label}</Text>
      <Text
        style={{ flex: 1, color: colors.onSurface, ...(typography.bodyMedium as any) }}
        numberOfLines={multiline ? 2 : 1}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  localCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    backgroundColor: 'rgba(31,41,55,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: 14,
  },
});

export default Page;