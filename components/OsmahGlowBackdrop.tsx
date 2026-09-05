import React from 'react';
import { StyleSheet, View } from 'react-native';
import { withAlpha, CyanNeon, DeepViolet, MagentaGlow } from '@/theme/colors';

/** Soft multi-hue radial-ish glow behind the hero orb. Purely decorative,
 *  layered translucent circles — no gradient dependency, zero per-frame work. */
export function OsmahGlowBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.glow, styles.a, { backgroundColor: withAlpha(CyanNeon, 0.14) }]} />
      <View style={[styles.glow, styles.b, { backgroundColor: withAlpha(DeepViolet, 0.16) }]} />
      <View style={[styles.glow, styles.c, { backgroundColor: withAlpha(MagentaGlow, 0.08) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    borderRadius: 999,
  },
  a: { width: 460, height: 460, top: '24%', alignSelf: 'center', left: '20%' },
  b: { width: 380, height: 380, top: '34%', alignSelf: 'center', left: '38%' },
  c: { width: 300, height: 300, top: '42%', alignSelf: 'center', left: '12%' },
});