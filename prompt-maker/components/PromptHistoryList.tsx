// Prompt Maker — isolated history list. Renders saved prompts newest first;
// tapping one opens it in the viewer, the trash icon removes it permanently
// (this module's own table only — nothing else is ever touched).

import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography } from '@/theme/typography';
import { withAlpha, CyanNeon, Red } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';
import type { PromptRecord } from '../types/prompt-types';
import { previewOf } from '../services/history-core';

const PromptHistoryList = ({
  records,
  activeId,
  lang,
  onOpen,
  onDelete,
}: {
  records: PromptRecord[];
  activeId?: number;
  lang: 'ar' | 'en';
  onOpen: (record: PromptRecord) => void;
  onDelete: (record: PromptRecord) => void;
}) => {
  const { colors } = useTheme();
  const { t } = useI18n();

  const confirmDelete = (record: PromptRecord) => {
    Alert.alert(t('promptMaker.deleteSessionTitle'), t('promptMaker.deleteSessionBody'), [
      { text: t('promptMaker.delete'), style: 'destructive', onPress: () => onDelete(record) },
      { text: t('chat.cancel'), style: 'cancel' },
    ]);
  };

  const timeOf = (ts: number) =>
    new Date(ts).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={[styles.heading, { color: colors.onSurface }]}>{t('promptMaker.sessionsTitle')}</Text>
        <Text style={[styles.hint, { color: colors.onSurfaceVariant }]}>{t('promptMaker.sessionsHint')}</Text>
      </View>

      {records.length === 0 ? (
        <View style={[styles.empty, { borderColor: withAlpha(colors.outline, 0.3) }]}>
          <MaterialIcons name="history" size={20} color={colors.onSurfaceVariant} />
          <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>{t('promptMaker.chatEmpty')}</Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => String(item.id ?? item.createdAt)}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const active = item.id != null && item.id === activeId;
            return (
              <Pressable
                onPress={() => onOpen(item)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderColor: active ? withAlpha(CyanNeon, 0.7) : withAlpha(colors.outline, 0.3),
                    backgroundColor: active ? withAlpha(CyanNeon, 0.07) : withAlpha(colors.surface, 0.35),
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.rowTitle, { color: active ? CyanNeon : colors.onSurface }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.rowPreview, { color: colors.onSurfaceVariant }]} numberOfLines={2}>
                    {previewOf(item.prompt)}
                  </Text>
                  <Text style={[styles.rowTime, { color: colors.onSurfaceVariant }]}>{timeOf(item.createdAt)}</Text>
                </View>
                <Pressable onPress={() => confirmDelete(item)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <MaterialIcons name="delete-outline" size={18} color={Red} />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  headRow: { gap: 2 },
  heading: { ...(typography.titleMedium as any) },
  hint: { ...(typography.bodySmall as any) },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { ...(typography.titleSmall as any) },
  rowPreview: { ...(typography.bodySmall as any) },
  rowTime: { ...(typography.labelSmall as any) },
});

export default PromptHistoryList;