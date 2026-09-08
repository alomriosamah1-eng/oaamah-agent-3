// Tools — the agent's working surface on-device.
//
// Two internal tabs:
//  • «Tools»  → entry cards for the agent's features (new chat, prompt maker,
//               chat history at /saved).
//  • «Saved»  → the real artifacts the agent produced on-device: PDF exports
//               and generated images. This lives INSIDE Tools, not in the
//               bottom bar.

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon, MagentaGlow, DeepViolet, Sky, Red } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';
import type { TKey } from '@/i18n/provider';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { getGeneratedImages, GeneratedImage } from '@/utils/Database';
import { listSavedFiles, removeSavedFile, SavedFileRef } from '@/utils/savedFiles';
import * as Sharing from 'expo-sharing';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';

interface ToolAction {
  key: string;
  titleKey: TKey;
  hintKey: TKey;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  route: '/chat' | '/promptMaker' | '/saved';
}

const ACTIONS: ToolAction[] = [
  {
    key: 'newChat',
    titleKey: 'tools.newChatTitle',
    hintKey: 'tools.newChatHint',
    icon: 'add-comment',
    color: CyanNeon,
    route: '/chat',
  },
  {
    key: 'promptMaker',
    titleKey: 'tools.promptMakerTitle',
    hintKey: 'tools.promptMakerHint',
    icon: 'psychology-alt',
    color: MagentaGlow,
    route: '/promptMaker',
  },
  {
    key: 'history',
    titleKey: 'tools.chatHistoryTitle',
    hintKey: 'tools.chatHistoryHint',
    icon: 'history',
    color: Sky,
    route: '/saved',
  },
];

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

  const [tab, setTab] = useState<'tools' | 'saved'>('tools');
  const [files, setFiles] = useState<SavedFileRef[]>([]);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [busy, setBusy] = useState(false);

  const topSafeArea = top > 0 ? top + 8 : 16;

  const reload = useCallback(async () => {
    const [f, imgs] = await Promise.all([listSavedFiles(), getGeneratedImages(db)]);
    setFiles(f);
    setImages(imgs);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [f, imgs] = await Promise.all([listSavedFiles(), getGeneratedImages(db)]);
        if (active) {
          setFiles(f);
          setImages(imgs);
        }
      })();
      return () => {
        active = false;
      };
    }, [db])
  );

  const docs = files.filter((f) => f.kind === 'pdf');

  const openFile = (f: SavedFileRef) => {
    if (f.kind === 'pdf') {
      router.push({
        pathname: '/pdf/[uri]',
        params: {
          uri: encodeURIComponent(f.uri),
          ...(f.id ? { id: f.id } : {}),
          ...(f.previewHtml ? { preview: encodeURIComponent(f.previewHtml) } : {}),
        },
      });
    } else router.push(`/image/${encodeURIComponent(f.uri)}`);
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
    Alert.alert(t('saved.deleteTitle'), t('saved.deleteBody'), [
      { text: t('saved.cancel'), style: 'cancel' },
      {
        text: t('saved.delete'),
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

      {/* Internal tabs */}
      <View style={[styles.segment, { borderColor: withAlpha(colors.outline, 0.25) }]}>
        {(
          [
            { key: 'tools', label: t('tools.title'), icon: 'construction' as const },
            { key: 'saved', label: t('saved.title'), icon: 'bookmark' as const },
          ] as const
        ).map((seg) => {
          const focused = tab === seg.key;
          return (
            <Pressable
              key={seg.key}
              onPress={() => setTab(seg.key)}
              style={[styles.segmentBtn, focused && { backgroundColor: withAlpha(CyanNeon, 0.14) }]}>
              <MaterialIcons name={seg.icon} size={16} color={focused ? CyanNeon : colors.onSurfaceVariant} />
              <Text style={{ color: focused ? CyanNeon : colors.onSurfaceVariant, fontSize: 13, fontWeight: focused ? '700' as any : '500' as any }}>
                {seg.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'tools' && (
        <View style={styles.grid}>
          {ACTIONS.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => router.navigate(action.route)}
              style={({ pressed }) => [
                styles.card,
                { borderColor: withAlpha(action.color, 0.35), backgroundColor: withAlpha(colors.surfaceVariant, 0.45) },
                pressed && { opacity: 0.75 },
              ]}>
              <View style={[styles.iconWrap, { backgroundColor: withAlpha(action.color, 0.16) }]}>
                <MaterialIcons name={action.icon} size={22} color={action.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
                  {t(action.titleKey)}
                </Text>
                <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }} numberOfLines={1}>
                  {t(action.hintKey)}
                </Text>
              </View>
              <MaterialIcons name="chevron-left" size={22} color={colors.onSurfaceVariant} />
            </Pressable>
          ))}
        </View>
      )}

      {tab === 'saved' && (
        <View style={{ marginTop: 18 }}>
          <Text style={{ color: colors.onBackground, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>
            {t('tools.savedFilesTitle')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any), marginBottom: 8 }}>
            {t('tools.savedFilesHint')}
          </Text>

          {busy ? (
            <ActivityIndicator color={CyanNeon} style={{ marginVertical: 20 }} />
          ) : docs.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: withAlpha(Red, 0.12), alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="picture-as-pdf" size={30} color={Red} />
              </View>
              <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodyMedium as any), textAlign: 'center' }}>
                {t('saved.filesEmpty')}
              </Text>
              <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any), textAlign: 'center' }}>
                {t('saved.filesEmptyBody')}
              </Text>
            </View>
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

          <View style={{ marginTop: 20 }}>
            <Text style={{ color: colors.onBackground, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>
              {t('tools.imagesTitle')}
            </Text>
          </View>
          {images.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodyMedium as any), textAlign: 'center' }}>
                {t('saved.imagesEmpty')}
              </Text>
            </View>
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
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
    marginTop: 16,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 8,
  },
  grid: { marginTop: 18, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
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
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
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