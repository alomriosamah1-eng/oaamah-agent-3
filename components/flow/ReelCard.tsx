import React, { memo } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { VideoSource } from 'expo-video';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon, MagentaGlow } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';
import { FlowVideoUnit } from '@/components/flow/FlowVideoUnit';
import type { FlowVideo } from '@/utils/flow/youtubeClient';
import type { StreamQuality } from '@/utils/flow/streamResolver';

interface ReelCardProps {
  video: FlowVideo;
  isActive: boolean;
  activeSource: VideoSource | null;
  quality: StreamQuality;
  onQualityChange: (q: StreamQuality) => void;
  isSaved: boolean;
  isLiked: boolean;
  matchedKeyword: string;
  onToggleSaved: () => void;
  onToggleLiked: () => void;
  /** Space (px) added above the bottom to stay clear of the floating tab bar. */
  bottomInset?: number;
}

const SkyColor = '#38BDF8';

// Memoized: only the active card's props (isActive / activeSource) change on
// scroll, so the other cards skip re-rendering entirely — keeps the feed light.
export const ReelCard = memo(function ReelCard({
  video,
  isActive,
  activeSource,
  quality,
  onQualityChange,
  isSaved,
  isLiked,
  matchedKeyword,
  onToggleSaved,
  onToggleLiked,
  bottomInset = 0,
}: ReelCardProps) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const shareUrl = `https://youtu.be/${video.ytId}`;

  const onShare = async () => {
    try {
      await Share.share({ message: `${video.title}\n${shareUrl}` });
    } catch {
      // ignore
    }
  };

  const railBtn = (
    icon: keyof typeof MaterialIcons.glyphMap,
    onPress: () => void,
    key: string,
    activeColor?: string
  ) => (
    <Pressable key={key} onPress={onPress} style={styles.railBtn}>
      <View style={styles.railIcon}>
        <MaterialIcons name={icon} size={26} color={activeColor ?? '#FFFFFF'} />
      </View>
    </Pressable>
  );

  return (
    <View style={styles.card}>
      {/* Poster thumbnail — full-bleed, matches the video surface style */}
      <Image source={{ uri: video.thumb || undefined }} style={StyleSheet.absoluteFill} resizeMode="cover" />

      {/* Live video surface for the active card */}
      {isActive && activeSource && (
        <View style={StyleSheet.absoluteFill}>
          <FlowVideoUnit source={activeSource} quality={quality} onQualityChange={onQualityChange} bottomInset={bottomInset} />
        </View>
      )}

      {/* Bottom gradient for readability */}
      <View style={styles.gradient} />

      {/* Info block bottom-left */}
      <View style={[styles.info, { bottom: 64 + bottomInset }]} pointerEvents="none">
        {matchedKeyword ? (
          <View style={styles.keywordChip}>
            <MaterialIcons name="local-fire-department" size={12} color={CyanNeon} />
            <Text style={styles.keywordText}>{matchedKeyword}</Text>
          </View>
        ) : null}
        <Text style={styles.channel}>{video.channel}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {video.title}
        </Text>
      </View>

      {/* Action rail — right side, TikTok style */}
      <View style={[styles.rail, { bottom: 96 + bottomInset }]}>
        {railBtn(isLiked ? 'favorite' : 'favorite-border', onToggleLiked, 'like', isLiked ? MagentaGlow : undefined)}
        {railBtn(isSaved ? 'download-done' : 'download', onToggleSaved, 'save', isSaved ? SkyColor : undefined)}
        {railBtn('share', onShare, 'share')}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, overflow: 'hidden', backgroundColor: '#000000' },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 190,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  info: { position: 'absolute', left: 14, right: 90, bottom: 64 },
  keywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: withAlpha('#0A0E17', 0.55),
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: withAlpha(CyanNeon, 0.5),
  },
  keywordText: { color: CyanNeon, fontSize: 11, fontWeight: FontWeights.medium as any },
  channel: {
    color: '#E5E7EB',
    ...(typography.labelMedium as any),
    fontWeight: FontWeights.semiBold as any,
    marginBottom: 4,
  },
  title: { color: '#FFFFFF', ...(typography.titleSmall as any), fontWeight: FontWeights.bold as any },
  rail: {
    position: 'absolute',
    right: 10,
    bottom: 96,
    alignItems: 'center',
    gap: 10,
  },
  railBtn: { alignItems: 'center' },
  railIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: withAlpha('#0A0E17', 0.55),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: withAlpha('#FFFFFF', 0.12),
  },
});