import { FontAwesome6, Ionicons } from '@expo/vector-icons';
import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { ChatMenuHost } from '@/components/ChatMenu';
import { useI18n } from '@/i18n/provider';

const ChatLayout = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  const headerRight = () => (
    <Link href="/chat" push asChild>
      <TouchableOpacity>
        <Ionicons name="create-outline" size={24} color={colors.primary} style={{ marginRight: 16 }} />
      </TouchableOpacity>
    </Link>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.primary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => setMenuOpen(true)}
              style={{ marginLeft: 8 }}
              hitSlop={16}>
              <FontAwesome6 name="grip-lines" size={20} color={colors.primary} />
            </TouchableOpacity>
          ),
        }}>
        <Stack.Screen name="index" options={{ title: t('appName'), headerRight }} />
        <Stack.Screen name="[id]" options={{ title: t('appName'), headerRight }} />
      </Stack>
      <ChatMenuHost menuOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
};

export default ChatLayout;