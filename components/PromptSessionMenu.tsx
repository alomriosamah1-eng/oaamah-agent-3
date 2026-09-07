import { MaterialIcons } from '@expo/vector-icons';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, MagentaGlow } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';
import { useEffect, useState } from 'react';
import {
  PromptSessionWithPreview,
  getPromptSessionsWithPreview,
  deletePromptSession,
  renamePromptSession,
} from '@/utils/Database';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Magenta = MagentaGlow;

function formatDate(ts: number, lang: 'ar' | 'en'): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (lang === 'ar') {
    return d.toLocaleDateString('ar-EG', { dateStyle: 'medium' });
  }
  return d.toLocaleDateString('en-GB', { dateStyle: 'medium' });
}

export const PromptSessionMenu = ({
  onClose,
  onOpenSession,
  onNewSession,
  activeId,
}: {
  onClose: () => void;
  onOpenSession: (id: number) => void;
  onNewSession: () => void;
  activeId?: number | null;
}) => {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const { bottom, top } = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [history, setHistory] = useState<PromptSessionWithPreview[]>([]);

  const reload = async () => {
    setHistory(await getPromptSessionsWithPreview(db));
  };

  useEffect(() => {
    reload();
  }, []);

  const onDelete = (sessionId: number) => {
    Alert.alert(t('promptMaker.deleteSessionTitle'), t('promptMaker.deleteSessionBody'), [
      { text: t('chat.cancel'), style: 'cancel' },
      {
        text: t('promptMaker.delete'),
        style: 'destructive',
        onPress: async () => {
          await deletePromptSession(db, sessionId);
          await reload();
        },
      },
    ]);
  };

  const onRename = (sessionId: number) => {
    Alert.prompt(t('promptMaker.renameSessionTitle'), t('promptMaker.renameSessionBody'), async (newName) => {
      if (newName) {
        await renamePromptSession(db, sessionId, newName);
        await reload();
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
          <View style={{ flex: 1 }}>
            <Text style={[styles.panelTitle, { color: colors.onBackground }]}>{t('promptMaker.sessionsTitle')}</Text>
            <Text style={{ color: colors.onSurfaceVariant, ...(typography.labelSmall as any) }} numberOfLines={1}>
              {t('promptMaker.sessionsHint')}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.newChat}
          onPress={onNewSession}>
          <MaterialIcons name="edit" size={18} color="#fff" />
          <Text style={styles.newChatText}>{t('promptMaker.newSession')}</Text>
        </TouchableOpacity>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {history.length === 0 ? (
            <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any), paddingVertical: 16, textAlign: 'center' }}>
              {t('promptMaker.sessionsHint')}
            </Text>
          ) : (
            history.map((session) => {
              const isActive = session.id === activeId;
              return (
                <TouchableOpacity
                  key={session.id}
                  style={[
                    styles.historyItem,
                    {
                      backgroundColor: isActive ? withAlpha(Magenta, 0.12) : 'rgba(31,41,55,0.4)',
                      borderColor: isActive ? withAlpha(Magenta, 0.5) : withAlpha(colors.outline, 0.18),
                    },
                  ]}
                  onLongPress={() => onRename(session.id)}
                  onPress={() => {
                    onClose();
                    onOpenSession(session.id);
                  }}>
                  {isActive ? <View style={[styles.activeBadge, { backgroundColor: Magenta }]} /> : null}
                  <View style={[styles.historyIcon, { backgroundColor: withAlpha(Magenta, 0.14) }]}>
                    <MaterialIcons name="psychology-alt" size={18} color={Magenta} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.historyText, { color: colors.onSurface }]} numberOfLines={1}>
                      {session.title}
                    </Text>
                    {session.preview ? (
                      <Text style={{ color: colors.onSurfaceVariant, ...(typography.labelSmall as any) }} numberOfLines={1}>
                        {session.preview}
                      </Text>
                    ) : null}
                    <Text style={{ color: withAlpha(colors.onSurfaceVariant, 0.7), ...(typography.labelSmall as any) }} numberOfLines={1}>
                      {formatDate(session.createdAt, lang)}
                    </Text>
                  </View>
                  <Pressable hitSlop={8} onPress={() => onDelete(session.id)}>
                    <MaterialIcons name="delete-outline" size={18} color={colors.onSurfaceVariant} />
                  </Pressable>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    </>
  );
};

export const PromptSessionMenuHost = ({
  menuOpen,
  onClose,
  onOpenSession,
  onNewSession,
  activeId,
}: {
  menuOpen: boolean;
  onClose: () => void;
  onOpenSession: (id: number) => void;
  onNewSession: () => void;
  activeId?: number | null;
}) => {
  return (
<Modal visible={menuOpen} transparent animationType="fade" onRequestClose={onClose}>
    {menuOpen && (
      <PromptSessionMenu
        onClose={onClose}
        onOpenSession={onOpenSession}
        onNewSession={onNewSession}
        activeId={activeId}
      />
    )}
  </Modal>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
  },
  panelLogoImage: {
    width: 24,
    height: 24,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '600' as any,
  },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: withAlpha(Magenta, 0.9),
    marginBottom: 12,
  },
  newChatText: {
    fontSize: 15,
    fontWeight: '700' as any,
    color: '#fff',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600' as any,
  },
  activeBadge: {
    position: 'absolute',
    top: 10,
    left: 0,
    bottom: 10,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
});