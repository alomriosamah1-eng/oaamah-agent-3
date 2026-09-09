import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, Green } from '@/theme/colors';
import { Spacer, Divider } from '@/theme/primitives';
import { SectionScaffold } from '@/components/SectionScaffold';
import { useI18n } from '@/i18n/provider';
import { LANGUAGES } from '@/i18n/strings';

const Page = () => {
  const { colors, isDark, setThemeMode } = useTheme();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();

  return (
    <SectionScaffold
      title={t('settings.appearance.title')}
      subtitle={t('settings.appearance.subtitle')}
      onBack={() => router.back()}>
      <Text style={[s.label, { color: colors.onSurface }]}>{t('settings.appearance.language')}</Text>
      <Text style={[s.hint, { color: colors.onSurfaceVariant }]}>{t('settings.appearance.languageHint')}</Text>
      <Spacer h={8} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {LANGUAGES.map((language) => {
          const selected = lang === language.key;
          const accent = colors.primary;
          return (
            <Pressable
              key={language.key}
              onPress={() => setLang(language.key)}
              style={{
                flex: 1,
                alignItems: 'center',
                borderRadius: 14,
                paddingVertical: 12,
                backgroundColor: selected ? withAlpha(colors.primaryContainer, 0.55) : withAlpha(colors.surfaceVariant, 0.7),
                borderWidth: 1,
                borderColor: selected ? accent : withAlpha(colors.outline, 0.25),
              }}>
              <Text style={{ color: selected ? accent : colors.onSurface, ...(typography.labelLarge as any), fontWeight: FontWeights.medium }}>
                {language.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Spacer h={18} />
      <Divider />
      <Spacer h={18} />

      <Pressable onPress={() => setThemeMode(isDark ? 'light' : 'dark')} style={[s.tile, { backgroundColor: colors.surfaceVariant, borderColor: colors.outline }]}>
        <View style={[s.iconWrap, { backgroundColor: withAlpha(Green, 0.16) }]}>
          <MaterialIcons name={isDark ? 'light-mode' : 'dark-mode'} size={22} color={Green} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
            {t('settings.appearance.theme')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>
            {isDark ? t('settings.appearance.darkTheme') : t('settings.appearance.lightTheme')} — {isDark ? t('settings.appearance.themeHint') : t('settings.appearance.lightThemeHint')}
          </Text>
        </View>
        <MaterialIcons name="swap-vert" size={22} color={colors.onSurfaceVariant} />
      </Pressable>
    </SectionScaffold>
  );
};

const s = StyleSheet.create({
  label: { fontSize: 15, fontWeight: '600' as any },
  hint: { fontSize: 12 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

export default Page;
