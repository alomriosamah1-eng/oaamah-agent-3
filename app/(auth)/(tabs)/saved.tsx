import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon } from '@/theme/colors';
import { Spacer } from '@/theme/primitives';
import { useI18n } from '@/i18n/provider';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteChat, getChatsWithPreview, renameChat } from '@/utils/Database';
import { ChatWithPreview } from '@/utils/Database';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';
import { useFocusEffect } from 'expo-router';

const Page = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();
  const [chats, setChats] = useState<ChatWithPreview[]>([]);

  const topSafeArea = insets.top > 0 ? insets.top + 8 : 16;

  const refresh = useCallback(async () => {
    setChats(await getChatsWithPreview(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const rows = await getChatsWithPreview(db);
        if (active) setChats(rows);
      })();
      return () => {
        active = false;
      };
    }, [db])
  );

  const onOpen = (chatId: number) => {
    router.navigate(`/chat/${chatId}`);
  };

  const onDelete = (chatId: number) => {
    Alert.alert(t('chat.deleteChatTitle'), t('chat.deleteChatBody'), [
      { text: t('chat.cancel'), style: 'cancel' },
      {
        text: t('chat.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteChat(db, chatId);
          await refresh();
        },
      },
    ]);
  };

  const onRename = (chatId: number) => {
    Alert.prompt(t('chat.renameChatTitle'), t('chat.renameChatBody'), async (newName) => {
      if (newName) {
        await renameChat(db, chatId, newName);
        await refresh();
      }
    });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: topSafeArea, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.onBackground, ...(typography.headlineMedium as any), fontWeight: FontWeights.bold }}>
            {t('saved.title')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodyMedium as any) }}>
            {t('saved.subtitle')}
          </Text>
        </View>
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: withAlpha(colors.primaryContainer, 0.5),
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <MaterialIcons name="bookmark" size={22} color={colors.primary} />
        </View>
      </View>

      <Spacer h={18} />

      {chats.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 72, gap: 12 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: withAlpha(CyanNeon, 0.12),
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <MaterialIcons name="bookmark-outline" size={34} color={CyanNeon} />
          </View>
          <Text style={{ color: colors.onSurface, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>
            {t('saved.emptyTitle')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodyMedium as any), textAlign: 'center' }}>
            {t('saved.emptyBody')}
          </Text>
          <Pressable
            onPress={() => router.navigate('/chat')}
            style={({ pressed }) => [
              {
                marginTop: 8,
                borderRadius: 14,
                backgroundColor: withAlpha(colors.primaryContainer, 0.5),
                borderWidth: 1,
                borderColor: withAlpha(colors.outline, 0.3),
                paddingHorizontal: 18,
                paddingVertical: 10,
              },
              pressed && { opacity: 0.7 },
            ]}>
            <Text style={{ color: colors.primary, ...(typography.labelLarge as any), fontWeight: FontWeights.medium }}>
              {t('chat.newChat')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {chats.map((chat) => (
            <View key={chat.id} style={[s.card, { backgroundColor: withAlpha(colors.surfaceVariant, 0.55), borderColor: withAlpha(colors.outline, 0.2) }]}>
              <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => onOpen(chat.id)} onLongPress={() => onRename(chat.id)}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: withAlpha(CyanNeon, 0.12),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <MaterialIcons name="chat-bubble-outline" size={18} color={CyanNeon} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.onSurface, ...(typography.bodyMedium as any), fontWeight: FontWeights.semiBold }} numberOfLines={1}>
                    {chat.title}
                  </Text>
                  {chat.preview ? (
                    <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }} numberOfLines={1}>
                      {chat.preview}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => onRename(chat.id)} style={{ padding: 4 }}>
                <MaterialIcons name="edit" size={18} color={colors.onSurfaceVariant} />
              </Pressable>
              <Pressable hitSlop={8} onPress={() => onDelete(chat.id)} style={{ padding: 4 }}>
                <MaterialIcons name="delete-outline" size={18} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <Spacer h={24} />
    </ScrollView>
  );
};

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
});

export default Page;