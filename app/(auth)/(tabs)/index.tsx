import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography } from '@/theme/typography';
import { withAlpha, CyanNeon, DeepViolet, MagentaGlow, EmeraldGlow, ElectricBlue, Red } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';
import { OsmahGlowBackdrop } from '@/components/OsmahGlowBackdrop';
import { OsamahHeader } from '@/components/OsamahHeader';
import { DateTimeCard } from '@/components/DateTimeCard';
import { VoiceOrb, VoiceOrbState, GalleryOrb, GalleryState, isGalleryStyle, type OrbStyleId } from '@/utils/orbs';
import { loadVoiceConfig } from '@/utils/voice/config';
import { useVoice } from '@/components/VoiceProvider';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';

const ORB_STATE: Record<string, VoiceOrbState> = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
};

/** Same lifecycle onto the gallery's five-state union ('failed' → error). */
const GALLERY_STATE: Record<VoiceOrbState, GalleryState> = {
  disconnected: 'idle',
  connecting: 'idle',
  'pre-connect-buffering': 'idle',
  failed: 'error',
  initializing: 'idle',
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
};

/** Per-phase hero orb palette — the orb shifts color as the agent state
 *  changes: white-calm idle, cyan listen, violet think, emerald speak,
 *  red error. The backdrop glows with the same pair behind it. */
const ORB_COLORS: Record<string, { color: string; colorTo: string }> = {
  idle: { color: '#A8F0FF', colorTo: DeepViolet },
  listening: { color: CyanNeon, colorTo: ElectricBlue },
  thinking: { color: DeepViolet, colorTo: MagentaGlow },
  speaking: { color: EmeraldGlow, colorTo: CyanNeon },
};

const Page = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const voice = useVoice();
  const router = useRouter();

  const topSafeArea = insets.top > 0 ? insets.top + 4 : 10;
  const bottomClearance = TAB_BAR_HEIGHT + insets.bottom;
  const orbSize = Math.min(width * 0.66, 300);
  const hasError = voice.lastError.length > 0 && voice.phase === 'idle';

  const orbState: VoiceOrbState = hasError ? 'failed' : ORB_STATE[voice.phase] ?? 'idle';
  const palette = hasError
    ? { color: Red, colorTo: MagentaGlow }
    : ORB_COLORS[voice.phase] ?? ORB_COLORS.idle;

  // Re-read the picker's choice whenever the screen regains focus — the
  // controller loads config once on mount, and the settings tab stays
  // mounted, so without this a new orb style only showed after relaunch.
  const [persistedStyle, setPersistedStyle] = useState<OrbStyleId | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadVoiceConfig()
        .then((cfg) => {
          if (active) setPersistedStyle(cfg.orbStyle);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );
  const orbStyleId = persistedStyle ?? voice.config.orbStyle;

  // One press controls the whole conversation — the floor is always yours:
  // idle → start listening · speaking/thinking → interrupt (audio stops, the
  // mic re-opens) · listening → stop everything.
  const onOrbPress = useCallback(() => {
    voice.toggle();
  }, [voice]);

  const tapLabel = (() => {
    if (voice.phase === 'idle') return t('voice.tapToListen');
    if (voice.phase === 'speaking' || voice.phase === 'thinking') return t('voice.tapToInterrupt');
    return t('voice.tapToStop');
  })();

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topSafeArea }]}>
      <OsmahGlowBackdrop />

      <OsamahHeader />

      <DateTimeCard />

      <View style={styles.orbZone}>
        <Pressable
          onPress={onOrbPress}
          accessibilityRole="button"
          accessibilityLabel={tapLabel}
          hitSlop={26}
          style={({ pressed }) => [
            styles.orbPress,
            { width: orbSize + 24, height: orbSize + 24, borderRadius: (orbSize + 24) / 2 },
            pressed && { opacity: 0.94 },
          ]}>
          {/* The orb's BODY — a vivid glow disc that shifts with the
              conversation state (cyan listen, violet think, emerald speak).
              No ring around it, no button look: the body IS the orb's
              background, the whole circle is the touch surface, and nothing
              inside reads as a control. Its hue (the secondary palette
              color) is deliberately different from the dots, so the bright
              saturated dots stand out against it. This disc belongs to the
              dotted shell only — the gallery orbs draw their own scene
              (including the background), so the old frame is skipped there. */}
          {!isGalleryStyle(orbStyleId) && (
            <>
              <View
                style={[
                  styles.orbBody,
                  { backgroundColor: withAlpha(palette.colorTo, 0.45), shadowColor: palette.colorTo },
                ]}
              />
              <View
                style={[
                  styles.orbInner,
                  { backgroundColor: withAlpha(palette.color, 0.16), shadowColor: palette.color },
                ]}
              />
            </>
          )}
          {isGalleryStyle(orbStyleId) ? (
            <GalleryOrb
              style={orbStyleId}
              state={GALLERY_STATE[orbState]}
              size={orbSize}
              color={palette.color}
              colorTo={palette.colorTo}
              inputAmplitude={voice.micLevel.level}
              outputAmplitude={voice.outputLevels.level}
            />
          ) : (
            <VoiceOrb
              state={orbState}
              size={orbSize}
              color={palette.color}
              colorTo={palette.colorTo}
              colorSpread={0.9}
              dotScale={1.2}
              inputAmplitude={voice.micLevel.level}
              outputAmplitude={voice.outputLevels.level}
            />
          )}
        </Pressable>

        <Text style={[styles.tapHint, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
          {tapLabel}
        </Text>
      </View>

      <Pressable
        onPress={() => router.push('/search')}
        accessibilityRole="button"
        accessibilityLabel={t('home.searchPlaceholder')}
        style={({ pressed }) => [
          styles.searchBar,
          { bottom: bottomClearance + 12, opacity: pressed ? 0.85 : 1 },
        ]}>
        <View style={[styles.searchIcon, { backgroundColor: withAlpha(CyanNeon, 0.14) }]}>
          <MaterialIcons name="search" size={20} color={CyanNeon} />
        </View>
        <Text style={[styles.searchText, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
          {t('home.searchPlaceholder')}
        </Text>
        <MaterialIcons name="arrow-forward" size={18} color={withAlpha(colors.onSurfaceVariant, 0.8)} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  orbZone: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  orbPress: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbBody: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 999,
    opacity: 0.95,
    shadowOpacity: 0.55,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  orbInner: {
    position: 'absolute',
    width: '62%',
    height: '62%',
    borderRadius: 999,
    opacity: 0.9,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  tapHint: {
    ...(typography.labelSmall as any),
    textAlign: 'center',
    paddingHorizontal: 32,
    opacity: 0.85,
  },
  searchBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: withAlpha(CyanNeon, 0.25),
    backgroundColor: 'rgba(31,41,55,0.55)',
    shadowColor: CyanNeon,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  searchIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchText: {
    flex: 1,
    ...(typography.bodyMedium as any),
    fontSize: 14,
  },
});

export default Page;