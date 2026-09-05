import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

  const topSafeArea = insets.top > 0 ? insets.top + 4 : 10;
  const orbSize = Math.min(width * 0.66, 300);
  const hasError = voice.lastError.length > 0 && voice.phase === 'idle';

  const orbState: VoiceOrbState = hasError ? 'failed' : ORB_STATE[voice.phase] ?? 'idle';
  const palette = hasError
    ? { color: Red, colorTo: MagentaGlow }
    : ORB_COLORS[voice.phase] ?? ORB_COLORS.idle;

  const onOrbPress = useCallback(() => {
    if (voice.phase === 'listening') {
      voice.toggle();
    } else if (voice.phase === 'thinking' || voice.phase === 'speaking') {
      voice.stop();
    } else {
      voice.toggle();
    }
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
          accessibilityLabel={t('voice.tapToListen')}
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
          {t('voice.tapToListen')}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  orbZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: TAB_BAR_HEIGHT,
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
});

export default Page;