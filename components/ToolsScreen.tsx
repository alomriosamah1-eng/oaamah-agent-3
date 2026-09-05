// Tools — the agent's working surface on-device.
//
// Contains "Saved Files": the real artifacts the agent produced (PDF exports
// registered when a chat is exported, generated images still referenced by the
// local message DB). Chat history is deliberately NOT here — that stays in the
// dedicated saved list and the chat menu, kept fully separate.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import * as Sharing from 'expo-sharing';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon, DeepViolet, Sky, Red } from '@/theme/colors';
import { GlassCard } from '@/theme/GlassComponents';
import { useI18n } from '@/i18n/provider';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';
import { getGeneratedImages, GeneratedImage } from '@/utils/Database';
import { listSavedFiles, removeSavedFile, SavedFileRef } from '@/utils/savedFiles';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function ToolsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { bottom, top } = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();

  const [files, setFiles] = useState<SavedFileRef[]>([]);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [f, imgs] = await Promise.all([listSavedFiles(), getGeneratedImages(db)]);
    setFiles(f);
    setImages(imgs);
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  const topSafeArea = top > 0 ? top + 8 : 16;
  const docs = files.filter((f) => f.kind === 'pdf');

  const openFile = (f: SavedFileRef) => {
    if (f.kind === 'pdf') shareFile(f);
    else {
      router.push(`/image/${encodeURIComponent(f.uri)}`);
    }
  };

  const shareFile = async (f: SavedFileRef) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(f.uri, {
          mimeType: f.kind === 'pdf' ? 'application/pdf' : 'image/*',
          dialogTitle: f.name,
        });
      } else {
        Alert.alert(t('tools.share'));
      }
    } catch {
      Alert.alert(t('tools.share'));
    }
  };

  const deleteFile = (f: SavedFileRef) => {
    Alert.alert(t('tools.deleteTitle'), t('tools.deleteBody'), [
      { text: t('tools.cancel'), style: 'cancel' },
      {
        text: t('tools.delete'),
        style: 'destructive',
        onPress: async () => {
          await removeSavedFile(f.id);
          setBusy(true);
          await reload();
          setBusy(false);
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: topSafeArea, paddingBottom: TAB_BAR_HEIGHT + bottom + 24 }}
      showsVerticalScrollIndicator={false}>
      <Text style={{ color: colors.onBackground, ...(typography.headlineSmall as any), fontWeight: FontWeights.bold }}>
        {t('tools.title')}
      </Text>
      <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodyMedium as any) }}>{t('tools.subtitle')}</Text>

      {/* Chat history — kept separate from files */}
      <Pressable
        onPress={() => router.navigate('/saved')}
        style={({ pressed }) => [styles.historyCard, { borderColor: withAlpha(Sky, 0.35) }, pressed && { opacity: 0.75 }]}>
        <View style={[styles.historyIcon, { backgroundColor: withAlpha(Sky, 0.16) }]}>
          <MaterialIcons name="history" size={20} color={Sky} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
            {t('tools.chatHistoryTitle')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }} numberOfLines={1}>
            {t('tools.chatHistoryHint')}
          </Text>
        </View>
        <MaterialIcons name="chevron-left" size={22} color={colors.onSurfaceVariant} />
      </Pressable>

      {/* Saved Files */}
      <View style={styles.sectionHead}>
        <Text style={{ color: colors.onBackground, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>
          {t('tools.savedFilesTitle')}
        </Text>
        <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{t('tools.savedFilesHint')}</Text>
      </View>

      {busy ? (
        <ActivityIndicator color={CyanNeon} style={{ marginVertical: 20 }} />
      ) : docs.length === 0 ? (
        <GlassCard cornerRadius={16}>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodyMedium as any), textAlign: 'center' }}>
            {t('tools.emptyTitle')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any), textAlign: 'center', marginTop: 4 }}>
            {t('tools.emptyBody')}
          </Text>
        </GlassCard>
      ) : (
        <View style={{ gap: 8 }}>
          {docs.map((f) => (
            <View key={f.id} style={[styles.fileRow, { borderColor: withAlpha(colors.outline, 0.2) }]}>
              <View style={[styles.fileIcon, { backgroundColor: withAlpha(Red, 0.14) }]}>
                <MaterialIcons name="picture-as-pdf" size={20} color={Red} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.onSurface, ...(typography.bodyMedium as any), fontWeight: FontWeights.semiBold }} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text style={{ color: colors.onSurfaceVariant, ...(typography.labelSmall as any) }} numberOfLines={1}>
                  {t('tools.pdf')} · {formatBytes(f.size ?? 0)} · {new Date(f.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Pressable onPress={() => openFile(f)} hitSlop={8} style={styles.rowAction}>
                <MaterialIcons name="open-in-new" size={18} color={CyanNeon} />
              </Pressable>
              <Pressable onPress={() => deleteFile(f)} hitSlop={8} style={styles.rowAction}>
                <MaterialIcons name="delete-outline" size={18} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Generated images */}
      <View style={styles.sectionHead}>
        <Text style={{ color: colors.onBackground, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>
          {t('tools.imagesTitle')}
        </Text>
      </View>
      {images.length === 0 ? (
        <GlassCard cornerRadius={16}>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodyMedium as any), textAlign: 'center' }}>
            {t('tools.emptyTitle')}
          </Text>
        </GlassCard>
      ) : (
        <View style={styles.imageGrid}>
          {images.slice(0, 18).map((img) => {
            const isNetwork = img.imageUrl.startsWith('http');
            return (
              <Pressable
                key={img.id}
                onPress={() => router.push(`/image/${encodeURIComponent(img.imageUrl)}`)}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                <View style={[styles.imageTile, { borderColor: withAlpha(DeepViolet, 0.3) }]}>
                  <View style={styles.imagePlaceholder}>
                    <MaterialIcons name="image" size={22} color={DeepViolet} />
                  </View>
                </View>
                <Text style={{ color: colors.onSurfaceVariant, ...(typography.labelSmall as any), marginTop: 4, textAlign: 'center' }} numberOfLines={1}>
                  {isNetwork ? t('tools.image') : img.prompt || t('tools.image')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(31,41,55,0.5)',
    borderWidth: 1,
    padding: 14,
    marginVertical: 14,
  },
  historyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionHead: { marginTop: 8, marginBottom: 10 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(31,41,55,0.5)',
    borderWidth: 1,
    padding: 12,
  },
  fileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowAction: { padding: 6 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  imageTile: {
    width: 100,
    height: 100,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagePlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#141b2d' },
});