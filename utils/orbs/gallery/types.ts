// The VoiceOrbs gallery — a port of the 15 voiceorbs designs
// (https://github.com/amunozdev/voiceorbs, MIT) to React Native/Expo,
// rendered with Skia on the UI thread via the same worklet-picture pattern
// as the rest of `@/utils/orbs`. Each style keeps the designs' look and
// feel rather than a byte-faithful reproduction of its CSS/WebGL — the
// orbs are drawn by hand in `paint.ts` against one shared contract.

export type OrbStyleId =
  | 'pulse'
  | 'glass'
  | 'pixel'
  | 'particles'
  | 'equalizer'
  | 'aurora'
  | 'halo'
  | 'gooey'
  | 'plasma'
  | 'galaxy'
  | 'nebula'
  | 'waveform'
  | 'edge-glow'
  | 'iridescent'
  | 'liquid-metal';

/** The lifecycle states our voice loop actually emits. */
export type GalleryState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

export interface OrbStyleMeta {
  id: OrbStyleId;
  name: string;
  tagline: string;
  /** Tech of the upstream design — kept for the settings list's look. */
  tech: string;
  colorFrom: string;
  colorTo: string;
}

export interface GalleryOrbProps {
  style: OrbStyleId;
  state?: GalleryState;
  size?: number;
  speed?: number;
  color?: string;
  colorTo?: string;
  /**
   * Live audio level, `0`–`1`. A `SharedValue` is written at frame rate
   * without re-rendering; a plain number is mirrored into a shared value.
   * When absent, each state supplies its own procedural energy so the orb
   * never sits still.
   */
  amplitude?: SharedValueType<number> | number;
  /** Microphone level — drives the orb while `listening`. */
  inputAmplitude?: SharedValueType<number> | number;
  /** The agent's output level — drives the orb while `speaking`. */
  outputAmplitude?: SharedValueType<number> | number;
  paused?: boolean;
  /** Reduced-motion override (defaults to the system setting). */
  reducedMotion?: boolean;
  accessibilityLabel?: string;
  containerStyle?: import('react-native').StyleProp<import('react-native').ViewStyle>;
}

/**
 * Reanimated `SharedValue`. Imported structurally (not from the lib) so a
 * plain number and a shared value stay interchangeable in the props above.
 */
export interface SharedValueType<T> {
  value: T;
  get(): T;
  set(v: T): void;
}