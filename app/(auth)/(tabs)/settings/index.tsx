import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon, ElectricBlue, DeepViolet, Amber, Green, EmeraldGlow } from '@/theme/colors';
import { Spacer, Divider } from '@/theme/primitives';
import { useI18n, TKey } from '@/i18n/provider';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';

type SectionKey = 'control' | 'knowledge' | 'profile' | 'chat' | 'appearance' | 'storage' | 'about' | 'developer';

interface AdminMeta {
  key: SectionKey;
  color: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

const ADMINS: AdminMeta[] = [
  { key: 'control', icon: 'tune', color: CyanNeon },
  { key: 'knowledge', icon: 'psychology', color: DeepViolet },
  { key: 'profile', icon: 'person', color: Amber },
  { key: 'chat', icon: 'chat-bubble', color: ElectricBlue },
  { key: 'appearance', icon: 'palette', color: Green },
  { key: 'storage', icon: 'cleaning-services', color: EmeraldGlow },
  { key: 'about', icon: 'info', color: '#FF6384' },
  { key: 'developer', icon: 'code', color: CyanNeon },
];

const Page = () => {
  const insets = useSafeAreaInsets();
  const topSafeArea = insets.top > 0 ? insets.top + 8 : 16;
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: topSafeArea, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 24 }}>
      <View>
        <Text style={{ color: colors.onSurface, ...(typography.titleLarge as any), fontWeight: FontWeights.bold }}>
          {t('settings.title')}
        </Text>
        <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodyMedium as any) }}>{t('settings.subtitle')}</Text>
      </View>
      <Spacer h={18} />
      <Divider />
      <Spacer h={16} />

      <View style={{ gap: 12 }}>
        {ADMINS.map((admin) => (
          <Pressable
            key={admin.key}
            onPress={() => router.navigate(`/settings/${admin.key}`)}
            style={({ pressed }) => [
              s.adminCard,
              {
                borderColor: withAlpha(admin.color, 0.35),
                backgroundColor: withAlpha(colors.surfaceVariant, 0.4),
                opacity: pressed ? 0.75 : 1,
              },
            ]}>
            <View style={[s.iconWrap, { backgroundColor: withAlpha(admin.color, 0.16) }]}>
              <MaterialIcons name={admin.icon} size={24} color={admin.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
                {t(`settings.admins.${admin.key}.title` as TKey)}
              </Text>
              <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }} numberOfLines={1}>
                {t(`settings.admins.${admin.key}.subtitle` as TKey)}
              </Text>
            </View>
            <MaterialIcons name="chevron-left" size={24} color={colors.onSurfaceVariant} />
          </Pressable>
        ))}
      </View>
      <Spacer h={24} />
    </ScrollView>
  );
};

const s = StyleSheet.create({
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  iconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

export default Page;