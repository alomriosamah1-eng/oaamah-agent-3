import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { withAlpha, CyanNeon, DeepViolet, MagentaGlow } from '@/theme/colors';
import { typography, FontWeights } from '@/theme/typography';

/**
 * "OSAMAH AI" / "OSAMAH PROMPTS" brand title for nav headers. Matches the
 * home hero header styling: monospace "OSAMAH" in cyan + the suffix in
 * violet with a soft glow, sized to sit inside a stack header.
 */
export function BrandNavTitle({ suffix }: { suffix: string }) {
  return (
    <Text
      style={styles.brand}
      numberOfLines={1}
      adjustsFontSizeToFit>
      <Text style={styles.cyanPart}>OSAMAH </Text>
      <Text style={styles.violetPart}>{suffix}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  brand: {
    fontFamily: 'SpaceMono',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 1,
    fontWeight: '700',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  cyanPart: {
    color: CyanNeon,
    textShadowColor: withAlpha(CyanNeon, 0.75),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  violetPart: {
    color: DeepViolet,
    textShadowColor: withAlpha(MagentaGlow, 0.7),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});