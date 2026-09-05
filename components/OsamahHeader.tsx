import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon, DeepViolet, MagentaGlow, AmberGlow } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';

/**
 * "OSAMAH AGENT" brand header — distinctive monospace (SpaceMono, already
 * bundled), mixed palette: turquoise "OSAMAH" + violet "AGENT" glow + a pulsing
 * orange underline. The whole name performs a full marquee pass (scrolling by
 * exactly its own measured width — off to the side — then gliding back).
 * Uses React Native's core Animated (native driver) so motion always works in
 * Expo Go — no reanimated dependency.
 */
export function OsamahHeader() {
  const { colors } = useTheme();
  const { t } = useI18n();

  const [brandW, setBrandW] = useState(0);

  const x = useRef(new Animated.Value(0)).current;
  const underline = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (brandW <= 0) return;
    const sweep = brandW;
    const mover = Animated.loop(
      Animated.sequence([
        Animated.delay(60000),
        Animated.timing(x, {
          toValue: -sweep,
          duration: 3200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(1400),
        Animated.timing(x, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(60000),
      ]),
      { resetBeforeIteration: true }
    );
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(underline, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(underline, {
          toValue: 0.4,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
      { resetBeforeIteration: true }
    );
    mover.start();
    glow.start();
    return () => {
      mover.stop();
      glow.stop();
    };
  }, [brandW, x, underline]);

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.mover, { transform: [{ translateX: x }] }]}>
        <Text
          style={styles.brand}
          onLayout={(e) => {
            setBrandW(Math.round(e.nativeEvent.layout.width));
          }}>
          <Text style={styles.cyanPart}>OSAMAH </Text>
          <Text style={styles.violetPart}>AGENT</Text>
        </Text>
        <Animated.View
          style={[
            styles.underline,
            {
              transform: [{ scaleX: underline }],
              opacity: underline.interpolate({ inputRange: [0.4, 1], outputRange: [0.7, 1] }),
            },
          ]}
        />
      </Animated.View>
      <Text style={[styles.tagline, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
        {t('appSubtitle')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginTop: 4 },
  mover: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  brand: {
    fontFamily: 'SpaceMono',
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: 1.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  cyanPart: {
    color: CyanNeon,
    textShadowColor: withAlpha(CyanNeon, 0.75),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
  },
  violetPart: {
    color: DeepViolet,
    textShadowColor: withAlpha(MagentaGlow, 0.7),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
  },
  underline: {
    width: 112,
    height: 3,
    borderRadius: 2,
    backgroundColor: AmberGlow,
    marginTop: 5,
    shadowColor: AmberGlow,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  tagline: {
    marginTop: 7,
    textAlign: 'center',
    ...(typography.labelMedium as any),
    fontWeight: FontWeights.medium,
  },
});