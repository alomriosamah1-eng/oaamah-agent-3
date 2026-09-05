// غلاف مشترك لصفحات الإدارات الفرعية في الإعدادات (رأس بعودة + تمرير) — ported from "osamah agent"
import React from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function SectionScaffold({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { bottom } = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.header, { borderBottomColor: withAlpha(colors.outline, 0.2) }]}>
        <Pressable
          onPress={onBack}
          hitSlop={10}
          style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.6 : 1 }]}
          accessibilityLabel={t('settings.back')}>
          <MaterialIcons name="arrow-forward" size={24} color={colors.primary} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text
            style={{ color: colors.onBackground, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}
            numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: TAB_BAR_HEIGHT + bottom + 24 }}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    backgroundColor: '#0F1522',
  },
});