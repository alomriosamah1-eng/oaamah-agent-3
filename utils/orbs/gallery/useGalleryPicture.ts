// Gallery orb animation as a hook — the same worklet-picture pattern as
// `useThinkingOrbPicture`, but for the hand-drawn voiceorbs scenes: a clock
// advanced by `useFrameCallback`, a smoothed level, and a `useDerivedValue`
// that records one Skia picture per frame. `GalleryOrb` is a thin wrapper;
// consumers embedding several orbs in one `<Canvas>` can call this directly.

import { useEffect, useMemo } from 'react';
import type { SkPicture } from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type DerivedValue,
} from 'react-native-reanimated';
import { recordGalleryPicture } from './paint';
import type { GalleryState, OrbStyleId, SharedValueType } from './types';

const MAX_DT_MS = 100;
/** Reduced-motion pace multiplier — same rule as the main orb. */
const REDUCED_SPEED = 0.3;
const ATTACK_MS = 45;
const RELEASE_MS = 240;

/** "#RRGGBB" (or "#RGB") dec/#hex → unit-rgb triple on the JS thread. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [0.3, 0.5, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export interface UseGalleryPictureOptions {
  style: OrbStyleId;
  state?: GalleryState;
  size?: number;
  speed?: number;
  color?: string;
  colorTo?: string;
  amplitude?: SharedValueType<number> | number;
  paused?: boolean;
  reducedMotion?: boolean;
}

/**
 * Drive one gallery orb and return its per-frame Skia picture (bounds
 * `(0, 0, size, size)`). Amplitude arrives as a SharedValue or a plain
 * number (mirrored into a shared value); absent, each state keeps an
 * internal energy so previews never sit still.
 */
export function useGalleryPicture({
  style,
  state = 'idle',
  size = 64,
  speed = 1,
  color = '#00F0FF',
  colorTo = '#7928CA',
  amplitude,
  paused = false,
  reducedMotion,
}: UseGalleryPictureOptions = {} as UseGalleryPictureOptions): DerivedValue<SkPicture> {
  const from = useMemo(() => hexToRgb(color), [color]);
  const to = useMemo(() => hexToRgb(colorTo), [colorTo]);

  const reduced = reducedMotion ?? useReducedMotion();
  const effSpeed = speed * (reduced ? REDUCED_SPEED : 1);
  const effSpeedSV = useSharedValue(effSpeed);
  useEffect(() => {
    effSpeedSV.set(effSpeed);
  }, [effSpeed, effSpeedSV]);

  const ownAmpSV = useSharedValue(0);
  useEffect(() => {
    if (typeof amplitude === 'number') ownAmpSV.set(amplitude);
  }, [amplitude, ownAmpSV]);
  const ampSV = typeof amplitude === 'number' ? ownAmpSV : amplitude;

  const level = useSharedValue(0);
  const phase = useSharedValue(-1);
  useEffect(() => {
    phase.set(-1);
  }, [style, size, phase]);

  const frame = useFrameCallback((info) => {
    'worklet';
    if (phase.get() < 0) {
      phase.set((info.timestamp / 1000) * effSpeedSV.get());
      return;
    }
    let dt = info.timeSincePreviousFrame ?? 0;
    if (dt > MAX_DT_MS) dt = MAX_DT_MS;
    phase.set(phase.get() + (dt / 1000) * effSpeedSV.get());

    const cur = level.get();
    if (ampSV != null || cur !== 0) {
      let a = 0;
      if (ampSV != null) {
        a = ampSV.get();
        if (!(a > 0)) a = 0;
        else if (a > 1) a = 1;
      }
      const tau = a > cur ? ATTACK_MS : RELEASE_MS;
      const next = cur + (a - cur) * (1 - Math.exp(-dt / tau));
      level.set(a === 0 && next < 1e-4 ? 0 : next);
    }
  }, false);

  useEffect(() => {
    frame.setActive(!paused);
  }, [paused, frame]);

  return useDerivedValue<SkPicture>(() => {
    'worklet';
    return recordGalleryPicture(
      style,
      size,
      Math.max(0, phase.get()),
      level.get(),
      state,
      from,
      to,
    );
  }, [style, size, state, from, to]);
}