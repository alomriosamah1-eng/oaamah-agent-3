// Prompt Maker — history drawer, styled to match the osamah AI interface
// exactly (same left slide-in panel + logo header + new-session button + card
// list as the chat sidebar). Driven by the module's isolated history only.

import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography } from '@/theme/typography';
import { withAlpha, MagentaGlow } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PromptRecord } from '../types/prompt-types';
import { previewOf } from '../services/history-core';

const Magenta = MagentaGlow;

const formatDate = (ts: number, lang: 'ar' | 'en') => {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' });
};

const PromptHistoryModal = ({
  visible,
  records,
  activeId,
  lang,
  onClose,
  onOpen,
  onDelete,
  onNewPrompt,
}: {
  visible: boolean;
  records: PromptRecord[];
  activeId?: number;
  lang: 'ar' | 'en';
  onClose: () => void;
  onOpen: (record: PromptRecord) => void;
  onDelete: (record: PromptRecord) => void;
  onNewPrompt: () => void;
}) => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { bottom, top } = useSafeAreaInsets();

  const onDeleteClick = (record: PromptRecord) => {
    Alert.alert(t('promptMaker.deleteSessionTitle'), t('promptMaker.deleteSessionBody'), [
      { text: t('chat.cancel'), style: 'cancel' },
      { text: t('promptMaker.delete'), style: 'destructive', onPress: () => onDelete(record) },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible && (
        <>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View
            style={[
              styles.panel,
              { paddingTop: top + 8, paddingBottom: bottom + 8, backgroundColor: colors.background },
            ]}>
            <View style={styles.panelHeader}>
              <View style={[styles.panelLogo, { backgroundColor: '#000', borderColor: withAlpha(colors.outline, 0.4) }]}>
                <Image
                  source={require('@/assets/images/logo-white.png')}
                  style={styles.panelLogoImage}
                  resizeMode="contain"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.panelTitle, { color: colors.onBackground }]}>
                  {t('promptMaker.sessionsTitle')}
                </Text>
                <Text style={{ color: colors.onSurfaceVariant, ...(typography.labelSmall as any) }} numberOfLines={1}>
                  {t('promptMaker.sessionsHint')}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.newPrompt, { backgroundColor: withAlpha(Magenta, 0.9) }]}
              onPress={() => {
                onNewPrompt();
                onClose();
              }}>
              <MaterialIcons name="edit" size={18} color="#fff" />
              <Text style={styles.newPromptText}>{t('promptMaker.newSession')}</Text>
            </TouchableOpacity>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {records.length === 0 ? (
                <Text
                  style={{
                    color: colors.onSurfaceVariant,
                    ...(typography.bodySmall as any),
                    paddingVertical: 16,
                    textAlign: 'center',
                  }}>
                  {t('promptMaker.sessionsHint')}
                </Text>
              ) : (
                records.map((record) => {
                  const isActive = record.id != null && record.id === activeId;
                  return (
                    <TouchableOpacity
                      key={record.id ?? record.createdAt}
                      style={[
                        styles.historyItem,
                        {
                          backgroundColor: isActive ? withAlpha(Magenta, 0.12) : 'rgba(31,41,55,0.4)',
                          borderColor: isActive ? withAlpha(Magenta, 0.5) : withAlpha(colors.outline, 0.18),
                        },
                      ]}
                      onPress={() => {
                        onOpen(record);
                        onClose();
                      }}>
                      {isActive ? <View style={[styles.activeBadge, { backgroundColor: Magenta }]} /> : null}
                      <View style={[styles.historyIcon, { backgroundColor: withAlpha(Magenta, 0.14) }]}>
                        <MaterialIcons name="psychology-alt" size={18} color={Magenta} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.historyText, { color: colors.onSurface }]} numberOfLines={1}>
                          {record.title}
                        </Text>
                        <Text
                          style={{ color: colors.onSurfaceVariant, ...(typography.labelSmall as any) }}
                          numberOfLines={1}>
                          {previewOf(record.prompt)}
                        </Text>
                        <Text
                          style={{ color: withAlpha(colors.onSurfaceVariant, 0.7), ...(typography.labelSmall as any) }}
                          numberOfLines={1}>
                          {formatDate(record.createdAt, lang)}
                        </Text>
                      </View>
                      <Pressable hitSlop={8} onPress={() => onDeleteClick(record)}>
                        <MaterialIcons name="delete-outline" size={18} color={colors.onSurfaceVariant} />
                      </Pressable>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </>
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
  newPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  newPromptText: {
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

export default PromptHistoryModal;