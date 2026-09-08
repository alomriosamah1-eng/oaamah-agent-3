// StorageDonut — animated donut gauge for the "إدارة التخزين" page.
//
// Renders the user-scope storage footprint as a colored segmented ring
// (phone-cleaner style) with a scanning needle and a real-time center readout.
// Pure decoration over `StorageBreakdown` — no data mutations here.
//
// Uses @shopify/react-native-skia (already a project dependency) + core `Animated`
// for the scan sweep, matching the rest of the app's animation conventions.

import React, { useMemo, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon, ElectricBlue, DeepViolet, MagentaGlow, Amber, Green, DarkSurface } from '@/theme/colors';
import { bytesLabel } from '@/utils/StorageMaintenance';
import type { StorageBreakdown, StorageCategoryId } from '@/utils/StorageMaintenance';

/** Stable color per category (also used by the page legend). */
export const CATEGORY_COLORS: Record<StorageCategoryId, string> = {
  knowledge: CyanNeon,
  videos: MagentaGlow,
  saved: DeepViolet,
  records: Amber,
  profile: ElectricBlue,
  cache: Green,
};

interface Segment {
  id: StorageCategoryId;
  path: ReturnType<typeof Skia.Path.Make>;
  color: string;
  fraction: number;
}

const SCAN_MS = 950;

function buildSegments(breakdown: StorageBreakdown, size: number, sw: number): Segment[] {
  const center = size / 2;
  const radius = (size - sw) / 2;
  const rect = { x: center - radius, y: center - radius, width: radius * 2, height: radius * 2 };
  const total = Math.max(breakdown.totalBytes, 1);
  const gap = 2.5; // degrees between segments
  let start = -90;
  const segments: Segment[] = [];
  for (const cat of breakdown.categories) {
    const deg = (cat.bytes / total) * 360;
    if (deg <= 0.0001) continue;
    const sweep = Math.max(deg - gap, 1.5);
    const path = Skia.Path.Make();
    path.addArc(rect, start + gap / 2, sweep);
    segments.push({ id: cat.id, path, color: CATEGORY_COLORS[cat.id], fraction: deg / 360 });
    start += deg;
  }
  return segments;
}

function needlePath(size: number, sw: number, angleDeg: number) {
  const center = size / 2;
  const inner = sw * 0.35;
  const outer = (size - sw) / 2;
  const rad = (angleDeg * Math.PI) / 180;
  const path = Skia.Path.Make();
  path.moveTo(center + Math.cos(rad) * inner, center + Math.sin(rad) * inner);
  path.lineTo(center + Math.cos(rad) * outer, center + Math.sin(rad) * outer);
  return path;
}

export function StorageDonut({
  breakdown,
  size = 224,
  accent = 'بياناتك',
}: {
  breakdown: StorageBreakdown;
  size?: number;
  accent?: string;
}) {
  const { colors } = useTheme();
  const sw = 22;
  const [needle, setNeedle] = useState(0); // degrees, -90 = top
  const scan = useMemo(() => new Animated.Value(0), []);

  const segments = useMemo(() => buildSegments(breakdown, size, sw), [breakdown, size]);

  const runScan = () => {
    scan.setValue(0);
    Animated.timing(scan, { toValue: 1, duration: SCAN_MS, useNativeDriver: false }).start();
  };

  React.useEffect(() => {
    const id = scan.addListener(({ value }) => {
      const eased = 1 - Math.pow(1 - value, 3);
      setNeedle(-90 + eased * 360);
    });
    runScan();
    return () => scan.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdown.totalBytes]);

  return (
    <View style={s.wrap}>
      <View style={[s.canvasWrap, { width: size, height: size }]}>
        <Canvas style={{ width: size, height: size }}>
          <Circle cx={size / 2} cy={size / 2} r={(size - sw) / 2 + 6} color={DarkSurface} />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={(size - sw) / 2 + 6}
            color={withAlpha('#FFFFFF', 0.06)}
            style="stroke"
            strokeWidth={1.5}
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={(size - sw) / 2}
            color={withAlpha('#FFFFFF', 0.08)}
            style="stroke"
            strokeWidth={sw}
          />
          {segments.map((seg) => (
            <React.Fragment key={seg.id}>
              <Path path={seg.path} color={withAlpha(seg.color, 0.22)} style="stroke" strokeWidth={sw + 8} strokeCap="round" />
              <Path path={seg.path} color={seg.color} style="stroke" strokeWidth={sw} strokeCap="round" />
            </React.Fragment>
          ))}
          <Path
            path={needlePath(size, sw, needle)}
            color={withAlpha('#FFFFFF', 0.75)}
            style="stroke"
            strokeWidth={2.5}
            strokeCap="round"
          />
          <Circle cx={size / 2} cy={size / 2} r={sw / 2 + 3} color={withAlpha('#FFFFFF', 0.18)} />
          <Circle cx={size / 2} cy={size / 2} r={sw / 2} color={withAlpha('#FFFFFF', 0.45)} />
        </Canvas>
        <View style={[s.centerLabel, { width: size, height: size }]} pointerEvents="none">
          <Text
            style={{ color: colors.onSurface, ...(typography.headlineSmall as any), fontWeight: FontWeights.bold }}
            adjustsFontSizeToFit
            numberOfLines={1}>
            {bytesLabel(breakdown.totalBytes)}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{accent}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 6 },
  canvasWrap: { alignItems: 'center', justifyContent: 'center' },
  centerLabel: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
});

export default StorageDonut;