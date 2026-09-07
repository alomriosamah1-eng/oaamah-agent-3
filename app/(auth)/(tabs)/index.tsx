import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography } from '@/theme/typography';
import { withAlpha, CyanNeon, DeepViolet, MagentaGlow, EmeraldGlow, ElectricBlue, Red } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';
import { OsmahGlowBackdrop } from '@/components/OsmahGlowBackdrop';
import { OsamahHeader } from '@/components/OsamahHeader';
import { DateTimeCard } from '@/components/DateTimeCard';
import { VoiceOrb, VoiceOrbState } from '@/utils/orbs';
import { useVoiceController } from '@/utils/voice/useVoiceController';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';

const ORB_STATE: Record<string, VoiceOrbState> = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
};

/** Per-phase hero orb palette — the orb shifts color as the agent state
 *  changes: white-calm idle, cyan listen, violet think, emerald speak,
 *  red error. */
const ORB_COLORS: Record<string, { color: string; colorTo: string }> = {
  idle: { color: '#E0F7FF', colorTo: DeepViolet },
  listening: { color: CyanNeon, colorTo: ElectricBlue },
  thinking: { color: DeepViolet, colorTo: MagentaGlow },
  speaking: { color: EmeraldGlow, colorTo: CyanNeon },
};

const Page = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const voice = useVoiceController();
  const router = useRouter();

  const topSafeArea = insets.top > 0 ? insets.top + 4 : 10;
  const bottomClearance = TAB_BAR_HEIGHT + insets.bottom;
  const orbSize = Math.min(width * 0.66, 300);
  const hasError = voice.lastError.length > 0 && voice.phase === 'idle';

  const orbState: VoiceOrbState = hasError ? 'failed' : ORB_STATE[voice.phase] ?? 'idle';
  const palette = hasError
    ? { color: Red, colorTo: MagentaGlow }
    : ORB_COLORS[voice.phase] ?? ORB_COLORS.idle;

  // One press controls the whole conversation: idle → start listening,
  // anything active → stop everything (turn the mic + agent + voice off).
  const onOrbPress = useCallback(() => {
    voice.toggle();
  }, [voice]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topSafeArea }]}>
      <OsmahGlowBackdrop />

      <OsamahHeader />

      <DateTimeCard />

      <View style={styles.orbZone}>
        <Pressable
          onPress={onOrbPress}
          accessibilityRole="button"
          accessibilityLabel={
            voice.phase === 'idle' ? t('voice.tapToListen') : t('voice.tapToStop')
          }
          style={({ pressed }) => [styles.orbPress, { width: orbSize + 22, height: orbSize + 22 }, pressed && { opacity: 0.92 }]}>
          <View style={[styles.orbHalo, { borderColor: withAlpha(palette.color, 0.4) }]} />
          <VoiceOrb
            state={orbState}
            size={orbSize}
            color={palette.color}
            colorTo={palette.colorTo}
            colorSpread={0.65}
            inputAmplitude={voice.micLevel.level}
            outputAmplitude={voice.outputLevels.level}
          />
        </Pressable>

        <Text style={[styles.tapHint, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
          {voice.phase === 'idle' ? t('voice.tapToListen') : t('voice.tapToStop')}
        </Text>

        <Text
          style={[
            styles.statusLine,
            { color: hasError ? Red : withAlpha(colors.onSurfaceVariant, 0.62) },
          ]}
          numberOfLines={1}>
          {hasError
            ? voice.lastError || voice.diag || ''
            : voice.sttNeedsGateway
              ? t('voice.cloudSttNeedsGateway')
              : voice.providerLine}
        </Text>
      </View>

      <Pressable
        onPress={() => router.navigate('/chat')}
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
  orbHalo: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 1,
    opacity: 0.35,
  },
  tapHint: {
    ...(typography.labelSmall as any),
    textAlign: 'center',
    paddingHorizontal: 32,
    opacity: 0.85,
  },
  statusLine: {
    ...(typography.labelSmall as any),
    textAlign: 'center',
    paddingHorizontal: 24,
    fontSize: 11,
    opacity: 0.9,
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