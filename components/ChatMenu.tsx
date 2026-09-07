import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Text, View, StyleSheet, TouchableOpacity, Modal, Pressable, Alert, ScrollView } from 'react-native';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';
import { useEffect, useState } from 'react';
import { getChats, renameChat } from '@/utils/Database';
import { useSQLiteContext } from 'expo-sqlite';
import { Chat } from '@/utils/Interfaces';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const ChatMenu = ({ onClose }: { onClose: () => void }) => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { bottom, top } = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [history, setHistory] = useState<Chat[]>([]);
  const router = useRouter();

  useEffect(() => {
    getChats(db).then((result) => setHistory(result as Chat[]));
  }, []);

  const navigate = (href: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(href);
  };

  const newChat = () => {
    onClose();
    router.replace('/chat');
  };

  const onDeleteChat = (chatId: number) => {
    Alert.alert(t('chat.deleteChatTitle'), t('chat.deleteChatBody'), [
      { text: t('chat.cancel'), style: 'cancel' },
      {
        text: t('chat.delete'),
        style: 'destructive',
        onPress: async () => {
          await db.runAsync('DELETE FROM chats WHERE id = ?', chatId);
          setHistory((await getChats(db)) as Chat[]);
        },
      },
    ]);
  };

  const onRenameChat = (chatId: number) => {
    Alert.prompt(t('chat.renameChatTitle'), t('chat.renameChatBody'), async (newName) => {
      if (newName) {
        await renameChat(db, chatId, newName);
        setHistory((await getChats(db)) as Chat[]);
      }
    });
  };

  return (
    <>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[styles.panel, { paddingTop: top + 8, paddingBottom: bottom + 8, backgroundColor: colors.background }]}>
        <View style={styles.panelHeader}>
          <View style={[styles.panelLogo, { backgroundColor: '#000', borderColor: withAlpha(colors.outline, 0.4) }]}>
            <Image
              source={require('@/assets/images/logo-white.png')}
              style={styles.panelLogoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.panelTitle, { color: colors.onBackground }]}>{t('appName')}</Text>
        </View>

        <TouchableOpacity
          style={[styles.newChat, { borderColor: withAlpha(colors.outline, 0.2) }]}
          onPress={newChat}>
          <MaterialIcons name="edit" size={20} color={colors.primary} />
          <Text style={[styles.newChatText, { color: colors.onSurface }]}>{t('chat.newChat')}</Text>
        </TouchableOpacity>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {history.map((chat) => (
            <TouchableOpacity
              key={chat.id}
              style={styles.historyItem}
              onLongPress={() => onRenameChat(chat.id)}
              onPress={() => navigate(`/chat/${chat.id}`)}>
              <MaterialIcons name="chat-bubble-outline" size={16} color={colors.onSurfaceVariant} />
              <Text style={[styles.historyText, { color: colors.onSurface }]} numberOfLines={1}>
                {chat.title}
              </Text>
              <TouchableOpacity hitSlop={8} onPress={() => onDeleteChat(chat.id)}>
                <MaterialIcons name="delete-outline" size={16} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.panelItem} onPress={() => navigate('/saved')}>
          <View style={[styles.panelIcon, { backgroundColor: withAlpha(colors.outline, 0.18) }]}>
            <MaterialIcons name="bookmark-outline" size={16} color={colors.onSurfaceVariant} />
          </View>
          <Text style={[styles.panelItemText, { color: colors.onSurface }]}>{t('saved.title')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.panelItem} onPress={() => navigate('/settings')}>
          <View style={[styles.panelIcon, { backgroundColor: withAlpha(colors.outline, 0.18) }]}>
            <MaterialIcons name="settings" size={16} color={colors.onSurfaceVariant} />
          </View>
          <Text style={[styles.panelItemText, { color: colors.onSurface }]}>{t('home.settings')}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: '86%',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 20,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
  },
  panelLogo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
  },
  panelLogoImage: {
    width: 20,
    height: 20,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '600' as any,
  },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  newChatText: {
    fontSize: 16,
    fontWeight: '500' as any,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  historyText: {
    flex: 1,
    fontSize: 15,
  },
  panelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  panelIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  panelItemText: {
    fontSize: 16,
    fontWeight: '500' as any,
  },
});

export const ChatMenuHost = ({
  menuOpen,
  onClose,
}: {
  menuOpen: boolean;
  onClose: () => void;
}) => {
  return (
<Modal visible={menuOpen} transparent animationType="fade" onRequestClose={onClose}>
    {menuOpen && <ChatMenu onClose={onClose} />}
  </Modal>
  );
};