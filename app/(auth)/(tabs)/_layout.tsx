import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { BottomTabBar } from '@/components/BottomTabBar';
import { useI18n } from '@/i18n/provider';

const TabsLayout = () => {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.primary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="flow" options={{ headerShown: false }} />
        <Stack.Screen name="tools" options={{ headerShown: false }} />
        <Stack.Screen name="promptMaker" options={{ headerShown: true }} />
        <Stack.Screen name="saved" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
      </Stack>
      <BottomTabBar />
    </View>
  );
};

export default TabsLayout;