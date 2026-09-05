import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { withAlpha, CyanNeon } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';

export const TAB_BAR_HEIGHT = 66;

export type TabKey = 'home' | 'chat' | 'tools' | 'settings';

interface TabDef {
  key: TabKey;
  labelKey: 'tabs.home' | 'tabs.chat' | 'tabs.tools' | 'tabs.settings';
  icon: keyof typeof MaterialIcons.glyphMap;
  activeIcon: keyof typeof MaterialIcons.glyphMap;
}

const TABS: TabDef[] = [
  { key: 'home', labelKey: 'tabs.home', icon: 'home', activeIcon: 'home' },
  { key: 'chat', labelKey: 'tabs.chat', icon: 'chat-bubble-outline', activeIcon: 'chat-bubble' },
  { key: 'tools', labelKey: 'tabs.tools', icon: 'construction', activeIcon: 'construction' },
  { key: 'settings', labelKey: 'tabs.settings', icon: 'settings', activeIcon: 'settings' },
];

const TARGET = {
  home: '/',
  chat: '/chat',
  tools: '/tools',
  settings: '/settings',
} as const;

export function useActiveTab(): TabKey {
  const pathname = usePathname();
  if (pathname === '/') return 'home';
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return 'chat';
  if (pathname === '/tools') return 'tools';
  if (pathname === '/saved') return 'chat';
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings';
  return 'home';
}

export function BottomTabBar() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const router = useRouter();
  const { t } = useI18n();
  const active = useActiveTab();

  const lift = Math.max(6, Math.round(height * 0.007));
  const gapBelow = insets.bottom + 4 + lift;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: withAlpha(colors.surface, 0.92),
          bottom: gapBelow,
        },
        { borderColor: withAlpha(colors.outline, 0.3) },
      ]}>
      {TABS.map((tab) => {
        const focused = active === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => router.navigate(TARGET[tab.key])}
            style={styles.tabItem}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t(tab.labelKey)}>
            <View style={[styles.iconWrap, focused && { backgroundColor: withAlpha(CyanNeon, 0.16) }]}>
              <MaterialIcons
                name={focused ? tab.activeIcon : tab.icon}
                size={24}
                color={focused ? CyanNeon : colors.onSurfaceVariant}
              />
            </View>
            {focused ? <View style={[styles.dot, { backgroundColor: CyanNeon }]} /> : <View style={styles.dotGap} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: TAB_BAR_HEIGHT,
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotGap: {
    width: 4,
    height: 4,
  },
});