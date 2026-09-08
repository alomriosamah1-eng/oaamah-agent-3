// Gallery registry — the 15 voiceorbs designs with their upstream names,
// taglines and default palettes. The ordering here is what the settings
// picker shows.

import type { OrbStyleId, OrbStyleMeta } from './types';

export const ORB_STYLES: readonly OrbStyleMeta[] = [
  {
    id: 'pulse',
    name: 'Pulse',
    tagline: 'Core with expanding rings and a loading arc',
    tech: 'Pure CSS',
    colorFrom: '#818cf8',
    colorTo: '#22d3ee',
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    tagline: 'A glassy bubble holding a drifting starfield and nebula',
    tech: 'Canvas',
    colorFrom: '#7c3aed',
    colorTo: '#22d3ee',
  },
  {
    id: 'particles',
    name: 'Particles',
    tagline: 'Particles form a rotating sphere that breathes with your voice',
    tech: 'Canvas',
    colorFrom: '#6366f1',
    colorTo: '#22d3ee',
  },
  {
    id: 'equalizer',
    name: 'Equalizer',
    tagline: 'Equalizer bars inside a disc that react to the audio level',
    tech: 'Pure CSS',
    colorFrom: '#38bdf8',
    colorTo: '#818cf8',
  },
  {
    id: 'plasma',
    name: 'Plasma',
    tagline: 'Organic mesh gradient that distorts and swirls with your voice',
    tech: 'Shader (canvas)',
    colorFrom: '#7c3aed',
    colorTo: '#06b6d4',
  },
  {
    id: 'nebula',
    name: 'Nebula',
    tagline: '3D sphere with simplex-noise displacement and fresnel — the "voice mode"',
    tech: 'WebGL (R3F + GLSL)',
    colorFrom: '#6366f1',
    colorTo: '#a855f7',
  },
  {
    id: 'iridescent',
    name: 'Iridescent Flow',
    tagline: 'Single-pass fragment shader with flowing iridescent hues',
    tech: 'Shader (canvas)',
    colorFrom: '#c084fc',
    colorTo: '#67e8f9',
  },
  {
    id: 'liquid-metal',
    name: 'Liquid Metal',
    tagline: 'Raymarched metaballs with a molten chrome finish',
    tech: 'Shader (canvas)',
    colorFrom: '#94a3b8',
    colorTo: '#38bdf8',
  },
  {
    id: 'glass',
    name: 'Glass',
    tagline: 'Iridescent glassmorphism with a spinning conic aura',
    tech: 'Pure CSS',
    colorFrom: '#818cf8',
    colorTo: '#f472b6',
  },
  {
    id: 'waveform',
    name: 'Waveform Ring',
    tagline: 'A ring whose radius traces the live waveform in polar coordinates',
    tech: 'Canvas',
    colorFrom: '#34d399',
    colorTo: '#38bdf8',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    tagline: 'Northern-lights veils that swirl and blur across the orb',
    tech: 'Pure CSS',
    colorFrom: '#34d399',
    colorTo: '#818cf8',
  },
  {
    id: 'halo',
    name: 'Halo',
    tagline: 'A conic halo with orbital rings and a bright core',
    tech: 'Pure CSS',
    colorFrom: '#818cf8',
    colorTo: '#f472b6',
  },
  {
    id: 'gooey',
    name: 'Gooey',
    tagline: 'A liquid blob whose edges boil with noise and displacement',
    tech: 'SVG filters',
    colorFrom: '#22d3ee',
    colorTo: '#818cf8',
  },
  {
    id: 'pixel',
    name: 'Pixel',
    tagline: 'A pixel-art sphere: a grid that pulses and ripples with your voice',
    tech: 'Canvas',
    colorFrom: '#a78bfa',
    colorTo: '#22d3ee',
  },
  {
    id: 'edge-glow',
    name: 'Edge Glow',
    tagline: 'A Siri-style conic glow wrapped around the core',
    tech: 'Pure CSS',
    colorFrom: '#818cf8',
    colorTo: '#c084fc',
  },
] as const;

const INDEX = new Map<string, OrbStyleMeta>(ORB_STYLES.map((s) => [s.id, s]));

export function resolveOrbStyle(id: string | undefined): OrbStyleMeta {
  const hit = id != null ? INDEX.get(id) : undefined;
  return hit ?? ORB_STYLES[0] as OrbStyleMeta;
}

/** The default fallback when nothing persists yet — keeps the current look. */
export const DEFAULT_GALLERY_STYLE: OrbStyleId = 'pulse';

/** Is the id a known gallery style? (The dotted "shell" is NOT in the gallery.) */
export function isGalleryStyle(id: string | undefined): id is OrbStyleId {
  return id != null && INDEX.has(id);
}