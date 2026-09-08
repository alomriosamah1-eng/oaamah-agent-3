// GalleryOrb — a hand-drawn voiceorbs scene (see `paint.ts`) behind the
// same lifecycle contract as `VoiceOrb`, so the two are drop-in
// interchangeable wherever an io track drives the level.

import { Canvas, Picture } from '@shopify/react-native-skia';
import { View } from 'react-native';
import type { GalleryOrbProps } from './types';
import { useGalleryPicture } from './useGalleryPicture';

const GALLERY_LABELS: Record<NonNullable<GalleryOrbProps['state']>, string> = {
  'idle': 'Ready',
  'listening': 'Listening…',
  'thinking': 'Thinking…',
  'speaking': 'Speaking…',
  'error': 'Connection failed',
};

export function GalleryOrb({
  style,
  state = 'idle',
  size = 64,
  speed,
  color,
  colorTo,
  amplitude: baseAmplitude,
  inputAmplitude,
  outputAmplitude,
  paused = false,
  reducedMotion,
  accessibilityLabel,
  containerStyle,
}: GalleryOrbProps) {
  console.log('[gallery] mount', style);
  let amplitude = baseAmplitude;
  if (state === 'listening') amplitude = inputAmplitude;
  else if (state === 'speaking') amplitude = outputAmplitude;
  const picture = useGalleryPicture({
    style,
    state,
    size,
    speed,
    color,
    colorTo,
    amplitude,
    paused,
    reducedMotion,
  });

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? GALLERY_LABELS[state]}
      style={[{ width: size, height: size }, containerStyle]}
    >
      <Canvas style={{ width: size, height: size }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}

export default GalleryOrb;