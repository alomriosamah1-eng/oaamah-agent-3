// The gallery's painters — one procedural Skia scene per voiceorbs design.
// Each scene is recorded into a Skia picture on the UI thread (worklet),
// reading only the shared clock + smoothed level. No CSS keyframes, no
// WebGL: everything is pixels, paths and gradients drawn with Skia paints.
//
// Allocation discipline — the dot-shell engine's rule, followed here too:
// a worklet runs on a runtime where creating native Skia handles per frame
// buys GC churn at best and a hard crash at worst on iOS Expo Go. So every
// paint, output rect and gradient shader is cached on `globalThis` and
// rebuilt only when its parameters actually change; "blurs" are stacked
// translucent passes instead of `Skia.ImageFilter.MakeBlur` (zero native
// allocation); and points are plain number pairs, not `Skia.Point` objects.

import { Skia, type SkCanvas, type SkPaint, type SkPath, type SkRRect, type SkRect } from '@shopify/react-native-skia';
import { PaintStyle, TileMode, ClipOp } from '@shopify/react-native-skia';
import type { SkPicture } from '@shopify/react-native-skia';
import type { GalleryState, OrbStyleId } from './types';

// SkApi enums are stable numbers. Read them once on the JS thread so the
// worklet only ever sees plain numeric captures (Reanimated serialisation).
const STYLE_FILL = PaintStyle.Fill;
const STYLE_STROKE = PaintStyle.Stroke;
const TILE_CLAMP = TileMode.Clamp;
const CLIP_COVER = ClipOp.Intersect;

type V3 = [number, number, number];

interface Ctx {
  c: SkCanvas;
  r: number;
  /** phase seconds (speed-scaled clock) */
  t: number;
  /** smoothed live level 0–1 (0 = use procedural energy) */
  lvl: number;
  st: GalleryState;
  /** unit RGB colorFrom */
  A: V3;
  /** unit RGB colorTo */
  B: V3;
  /** fixed layer slots 1–5 (cached scratch paints) */
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  p5: number;
  /** radius of the clip RRect (== r) */
  s2: number;
}

/* --------------------------------- math --------------------------------- */

const clamp01 = (x: number): number => {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
};
const lerp = (a: number, b: number, t: number): number => {
  'worklet';
  return a + (b - a) * t;
};

/** Deterministic hash for scatter (particles, stars, pixels). */
const hash1 = (i: number): number => {
  'worklet';
  let x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  x -= Math.floor(x);
  return x;
};

/** Cheap value noise in [0,1], enough for organic wiggle. */
const noise = (x: number, y: number): number => {
  'worklet';
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const u = (x - ix) * (x - ix) * (3 - 2 * (x - ix));
  const v = (y - iy) * (y - iy) * (3 - 2 * (y - iy));
  const a = hash1(ix + iy * 57.2);
  const b = hash1(ix + 1 + iy * 57.2);
  const c = hash1(ix + (iy + 1) * 57.2);
  const d = hash1(ix + 1 + (iy + 1) * 57.2);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

const fbm = (x: number, y: number): number => {
  'worklet';
  let v = 0;
  let amp = 0.55;
  let px = x;
  let py = y;
  for (let i = 0; i < 3; i++) {
    v += amp * noise(px, py);
    px = px * 2.03 + 11.7;
    py = py * 2.03 + 5.3;
    amp *= 0.5;
  }
  return v;
};

const stateEnergy = (st: GalleryState, t: number): number => {
  'worklet';
  switch (st) {
    case 'listening':
      return 0.42 + 0.32 * Math.abs(Math.sin(t * 8.5)) + 0.18 * Math.abs(Math.sin(t * 4.1 + 1.5));
    case 'speaking':
      return 0.3 + 0.24 * Math.abs(Math.sin(t * 6.2)) + 0.16 * Math.abs(Math.sin(t * 3 + 0.6));
    case 'thinking':
      return 0.24 + 0.2 * Math.abs(Math.sin(t * 2.4));
    case 'error':
      return 0.2;
    default:
      return 0;
  }
};

const energyFor = (lvl: number, st: GalleryState, t: number): number => {
  'worklet';
  return lvl > 0 ? lvl : stateEnergy(st, t);
};

/* --------------------------- cached scratch ----------------------------- */

interface Scratch {
  __galleryPaints?: Array<SkPaint | undefined>;
  __galleryShaderKeys?: Array<string | undefined>;
  __galleryBlend?: Float32Array;
  __galleryRect?: SkRect;
  __galleryRectSize?: number;
  __galleryClip?: SkRRect;
  __galleryClipSize?: number;
}

const scratch = (): Scratch => {
  'worklet';
  return globalThis as Scratch;
};

/** Cached scratch paints — one per fixed layer slot. No per-frame native alloc. */
const gPaint = (slot: number): SkPaint => {
  'worklet';
  const g = scratch();
  if (g.__galleryPaints === undefined) g.__galleryPaints = [];
  let p = g.__galleryPaints[slot];
  if (p === undefined) {
    p = Skia.Paint();
    p.setAntiAlias(true);
    g.__galleryPaints[slot] = p;
  }
  return p;
};

/** Reused RGBA buffer for solid-colour paints (engine rule: one mutable
 *  colour per frame is enough — `setColor` copies the components out
 *  immediately). Allocations stay inside the rare gradient rebuilds. */
const blendBuffer = (): Float32Array => {
  'worklet';
  const g = scratch();
  if (g.__galleryBlend === undefined) g.__galleryBlend = new Float32Array(4);
  return g.__galleryBlend!;
};

/** Write a colour into the shared buffer and paint with it. */
const setBlend = (p: SkPaint, r: number, g: number, b: number, a: number): void => {
  'worklet';
  const c = blendBuffer();
  c[0] = r;
  c[1] = g;
  c[2] = b;
  c[3] = a;
  p.setColor(c);
};

/** Cached output bounds rect for `beginRecording` (engine pattern). */
const gRect = (size: number): SkRect => {
  'worklet';
  const g = scratch();
  if (g.__galleryRect === undefined || g.__galleryRectSize !== size) {
    g.__galleryRect = Skia.XYWHRect(0, 0, size, size);
    g.__galleryRectSize = size;
  }
  return g.__galleryRect!;
};

/** Cached circular RRect used for the round clip. */
const gClip = (size: number, r: number): SkRRect => {
  'worklet';
  const g = scratch();
  if (g.__galleryClip === undefined || g.__galleryClipSize !== size) {
    g.__galleryClip = Skia.RRectXY(Skia.XYWHRect(0, 0, size, size), r, r);
    g.__galleryClipSize = size;
  }
  return g.__galleryClip!;
};

/** Shader-backed paints cached per slot by a parameter key — rebuilt only
 *  when the parameters actually change (steady-state: zero per-frame alloc). */
const shaderPaint = (slot: number, key: string, build: (p: SkPaint) => void): SkPaint => {
  'worklet';
  const g = scratch();
  if (g.__galleryShaderKeys === undefined) g.__galleryShaderKeys = [];
  const p = gPaint(slot);
  if (g.__galleryShaderKeys[slot] !== key) {
    build(p);
    g.__galleryShaderKeys[slot] = key;
  }
  return p;
};

/** Reclaim a slot for plain-colour drawing: drop any cached shader so the
 *  next paint on this slot is a solid colour again, not the stale gradient. */
const clearShader = (slot: number): void => {
  'worklet';
  const g = scratch();
  if (g.__galleryShaderKeys !== undefined && g.__galleryShaderKeys[slot] !== undefined) {
    gPaint(slot).setShader(null);
    g.__galleryShaderKeys[slot] = undefined;
  }
};

/* ------------------------------- painting ------------------------------- */

const rgba = (r: number, g: number, b: number, a: number): Float32Array => {
  'worklet';
  return Float32Array.of(r, g, b, a);
};

/** Mixed `a→b` colour at fraction f, on a fixed slot paint. */
const paintMix = (slot: number, style: number, A: V3, B: V3, f: number, a: number, w = 1): SkPaint => {
  'worklet';
  clearShader(slot);
  const p = gPaint(slot);
  setBlend(p, A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f, a);
  p.setStyle(style);
  if (style === STYLE_STROKE) p.setStrokeWidth(w);
  return p;
};

/** Radial gradient fill — shader cached by (cx, cy, rad, colours). */
const radialPaint = (slot: number, c0: V3, c1: V3, c2: V3 | null, cx: number, cy: number, rad: number): SkPaint => {
  'worklet';
  const key = `rad:${cx},${cy},${rad}:${c0[0]},${c0[1]},${c0[2]},${c1[0]},${c1[1]},${c1[2]},${c2 === null ? 0 : 1}`;
  return shaderPaint(slot, key, (p) => {
    const colors: Float32Array[] = c2
      ? [rgba(c0[0], c0[1], c0[2], 1), rgba(c1[0], c1[1], c1[2], 1), rgba(c2[0], c2[1], c2[2], 1)]
      : [rgba(c0[0], c0[1], c0[2], 1), rgba(c1[0], c1[1], c1[2], 1)];
    const pos = c2 ? [0, 0.6, 1] : [0, 1];
    p.setStyle(STYLE_FILL);
    p.setShader(Skia.Shader.MakeRadialGradient(Skia.Point(cx, cy), rad, colors, pos, TILE_CLAMP));
  });
};

/** Sweep gradient stroke/fill — shader cached by (cx, cy, colours, pos). */
const sweepPaint = (slot: number, cx: number, cy: number, stops: V3[], alphas: number[], pos: number[], strokeW: number): SkPaint => {
  'worklet';
  let key = `sw:${cx},${cy}:${pos.join(',')}:${strokeW}`;
  for (let i = 0; i < stops.length; i++) key += `:${stops[i]![0]},${stops[i]![1]},${stops[i]![2]},${alphas[i]}`;
  return shaderPaint(slot, key, (p) => {
    const colors = stops.map((s, i) => rgba(s[0], s[1], s[2], alphas[i] ?? 1));
    p.setShader(Skia.Shader.MakeSweepGradient(cx, cy, colors, pos, TILE_CLAMP));
    if (strokeW > 0) {
      p.setStyle(STYLE_STROKE);
      p.setStrokeWidth(strokeW);
    }
  });
};

/** Soft glow: a fill drawn as stacked translucent circles, no filter. */
const softFill = (c: SkCanvas, slot: number, x: number, y: number, rad: number, A: V3, B: V3, f: number, alpha: number): void => {
  'worklet';
  clearShader(slot);
  const p = gPaint(slot);
  const layers: Array<[number, number]> = [
    [1.0, 0.42],
    [0.92, 0.26],
    [0.82, 0.15],
    [0.7, 0.08],
  ];
  for (const [sc, wa] of layers) {
    const a = alpha * wa;
    if (a <= 0.008) continue;
    p.setStyle(STYLE_FILL);
    setBlend(p, A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f, a);
    c.drawCircle(x, y, rad * sc, p);
  }
};

/** Soft stroke on a path: a wide faint pass under the sharp pass. */
const softStrokePath = (c: SkCanvas, slot: number, path: SkPath, A: V3, B: V3, f: number, alpha: number, width: number): void => {
  'worklet';
  clearShader(slot);
  const p = gPaint(slot);
  p.setStyle(STYLE_STROKE);
  p.setStrokeWidth(width * 2.4);
  setBlend(p, A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f, alpha * 0.32);
  c.drawPath(path, p);
  p.setStrokeWidth(width);
  setBlend(p, A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f, alpha);
  c.drawPath(path, p);
};

/* --------------------------------- pulse --------------------------------- */

function drawPulse(C: Ctx): void {
  'worklet';
  const { c, r, t, st } = C;
  const en = energyFor(C.lvl, st, t);
  const active = st === 'listening' || st === 'speaking' ? 1 : 0.35;
  const speed = st === 'listening' ? 1.4 : st === 'speaking' ? 1.8 : 0.55;
  for (let k = 0; k < 3; k++) {
    const phase = (t * speed + k * 0.33) % 1;
    const rad = r * (0.42 + phase * 0.5 * (0.55 + 0.45 * en));
    const a = active * (1 - phase) * (0.5 + 0.5 * en) * 0.55;
    if (a > 0.02) {
      const p = paintMix(C.p1, STYLE_STROKE, C.A, C.B, 0.3 + phase * 0.4, a, r * 0.045);
      c.drawCircle(r, r, rad, p);
    }
  }
  softFill(c, C.p2, r, r, r * 0.5, C.A, C.B, 0.5, 0.28 + 0.35 * en);
  const core = paintMix(C.p3, STYLE_FILL, C.A, C.B, 0.1 + 0.5 * en, 0.85);
  c.drawCircle(r, r, r * (0.34 + 0.14 * en) * (1 + 0.12 * Math.sin(t * (st === 'speaking' ? 10 : 5))), core);
  const arcA = -t * (st === 'thinking' ? 1.6 : 0.7) * 360;
  const arc = paintMix(C.p4, STYLE_STROKE, C.B, C.A, 0.4, 0.9, r * 0.06);
  c.drawArc(Skia.XYWHRect(r * 0.22, r * 0.22, r * 1.56, r * 1.56), arcA, 60 + 120 * (st === 'thinking' ? 1 : 0), false, arc);
}

/* --------------------------------- glass --------------------------------- */

function drawGlass(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  const body = radialPaint(C.p1, C.B, C.A, null, r * 0.8, r * 0.75, r * 1.2);
  body.setAlphaf(0.9);
  c.drawCircle(r, r, r * 0.94, body);
  const aura = sweepPaint(C.p2, r, r, [C.A, C.B, C.A], [1, 1, 1], [0, 0.5, 1], r * 0.07);
  c.save();
  c.rotate((t * 0.4) * 180 / Math.PI, r, r);
  c.drawArc(Skia.XYWHRect(r * 0.02, r * 0.02, r * 1.96, r * 1.96), 0, 360, false, aura);
  c.restore();
  const spec = paintMix(C.p3, STYLE_FILL, C.A, [1, 1, 1], 0.75, 0.5 + 0.3 * en);
  c.drawOval(Skia.XYWHRect(r * 0.2, r * 0.12, r * 0.7, r * 0.34), spec);
  c.drawOval(Skia.XYWHRect(r * 0.14, r * 0.08, r * 0.82, r * 0.42), paintMix(C.p3, STYLE_FILL, C.A, [1, 1, 1], 0.75, 0.2 + 0.12 * en));
  const orb = paintMix(C.p4, STYLE_STROKE, C.B, [1, 1, 1], 0.2, 0.35, r * 0.018);
  c.save();
  c.rotate((t * 0.25) * 180 / Math.PI, r, r);
  c.drawOval(Skia.XYWHRect(-r * 0.18, -r * 0.52, r * 2.36, r * 1.04), orb);
  c.restore();
}

/* --------------------------------- pixel --------------------------------- */

function drawPixel(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  const grid = 13;
  const cell = (r * 2) / grid;
  const p = paintMix(C.p1, STYLE_FILL, C.A, C.B, 0, 1);
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const dx = (gx + 0.5) * cell - r;
      const dy = (gy + 0.5) * cell - r;
      const dist = Math.sqrt(dx * dx + dy * dy) / r;
      if (dist > 1) continue;
      const ripple = Math.sin(t * (C.st === 'listening' ? 9 : 4) - dist * 9 + (gx + gy) * 0.4);
      const px = clamp01(0.2 + 0.9 * en * Math.max(0, ripple)) * (1 - dist * 0.55);
      const rad = Math.max(0.02, cell * 0.4 * (0.3 + 0.7 * px));
      setBlend(
        p,
        C.A[0] + (C.B[0] - C.A[0]) * clamp01(dist * 0.85),
        C.A[1] + (C.B[1] - C.A[1]) * clamp01(dist * 0.85),
        C.A[2] + (C.B[2] - C.A[2]) * clamp01(dist * 0.85),
        clamp01(px * (0.6 + 0.4 * en)),
      );
      c.drawCircle(r + dx, r + dy, rad, p);
    }
  }
}

/* ------------------------------- particles ------------------------------- */

const P_LOC = 9.0; // 2π per loop φ in the lattice helper
function drawParticles(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  const yaw = t * 0.35;
  const pitch = Math.sin(t * 0.2) * 0.25;
  const breath = 0.55 + 0.45 * (en * 0.7 + 0.3 * Math.sin(t * (C.st === 'speaking' ? 9 : 4)));
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const p = paintMix(C.p1, STYLE_FILL, C.A, C.B, 0, 1);
  const rows = 15;
  for (let i = 0; i < 190; i++) {
    const lat = (i % rows) / (rows - 1) - 0.5;
    const lon = hash1(i) * P_LOC + t * 0.4;
    const phi = lat * Math.PI;
    let x = Math.cos(phi) * Math.cos(lon);
    let y = Math.sin(phi);
    let z = Math.cos(phi) * Math.sin(lon);
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;
    const y1 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    const depth = (z2 + 1) / 2;
    const rad = r * breath * 0.92 * Math.sqrt(Math.max(0.05, 1 - depth * depth * 0.9));
    setBlend(
      p,
      C.A[0] + (C.B[0] - C.A[0]) * depth,
      C.A[1] + (C.B[1] - C.A[1]) * depth,
      C.A[2] + (C.B[2] - C.A[2]) * depth,
      0.35 + 0.65 * depth,
    );
    c.drawCircle(r + x1 * r * breath, r + y1 * r * breath, Math.max(0.4, rad * 0.16), p);
  }
}

/* -------------------------------- equalizer ------------------------------ */

function drawEqualizer(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  const bars = 9;
  c.drawCircle(r, r, r * 0.92, paintMix(C.p1, STYLE_FILL, [0.07, 0.09, 0.16], C.A, 0.35, 0.55));
  c.drawCircle(r, r, r * 0.86, paintMix(C.p2, STYLE_STROKE, C.A, C.B, 0.4, 0.5, r * 0.02));
  softFill(c, C.p3, r, r, r * 0.9, C.B, C.A, 0.6, 0.2 + 0.35 * en);
  const bar = paintMix(C.p4, STYLE_FILL, C.A, C.B, 0.15, 0.9);
  const active = C.st === 'listening' || C.st === 'speaking';
  const thinking = C.st === 'thinking';
  for (let i = 0; i < bars; i++) {
    const ang = (i / bars) * 2 * Math.PI - Math.PI / 2;
    const y = Math.sin(t * 5.2 + i * 1.1);
    const swing = Math.max(0, y * 0.5 + 0.5);
    let h: number;
    if (active) h = 0.16 + 0.6 * en * swing;
    else if (thinking) h = 0.2 + 0.14 * Math.abs(Math.sin(t * 2 + i));
    else h = 0.13 + 0.05 * Math.sin(t * 0.8 + i);
    const bx = r + Math.cos(ang) * r * 0.5;
    const by = r + Math.sin(ang) * r * 0.5;
    const w = r * 0.05;
    const len = clamp01(h) * r * 0.9;
    c.drawRect(Skia.XYWHRect(bx - w / 2, by - len / 2, w, len), bar);
  }
}

/* --------------------------------- aurora -------------------------------- */

function drawAurora(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  const glow = paintMix(C.p1, STYLE_FILL, C.A, C.B, 0.5, 0.25 + 0.35 * en);
  c.drawCircle(r, r, r * 0.82, glow);
  c.save();
  c.clipRRect(gClip(C.s2, r), CLIP_COVER, true);
  const layers = 5;
  for (let k = 0; k < layers; k++) {
    const phase = t * (0.45 + k * 0.1) + k * 2.1;
    const amp = r * (0.3 + 0.2 * Math.sin(t * 0.3 + k));
    const path = Skia.Path.Make();
    const seg = 26;
    for (let i = 0; i < seg; i++) {
      const y = lerp(-r * 0.2, r * 2.2, i / (seg - 1));
      const x = -r * 0.7 + (k / (layers - 1)) * r * 1.4 + Math.sin(y * 0.06 + phase) * amp * (0.6 + 0.4 * Math.sin(y * 0.02));
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    softStrokePath(c, C.p2, path, C.B, C.A, 0.3 + 0.3 * (k % 2), 0.5 + 0.2 * en, r * 0.16);
  }
  c.restore();
}

/* ---------------------------------- halo --------------------------------- */

function drawHalo(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  softFill(c, C.p1, r, r, r * 0.92, C.B, C.A, 0.6, 0.24 + 0.3 * en);
  const halo = sweepPaint(C.p2, r, r, [C.A, C.B, C.A], [1, 1, 1], [0, 0.5, 1], r * 0.06);
  c.drawCircle(r, r, r * 0.9, halo);
  c.drawCircle(r, r, r * 0.3 * (1 + 0.08 * Math.sin(t * 6)), paintMix(C.p3, STYLE_FILL, C.A, [1, 1, 1], 0.55 + 0.35 * en, 0.95));
  for (let k = 0; k < 2; k++) {
    const rad = r * (k === 0 ? 0.62 : 0.78);
    const op = paintMix(C.p4, STYLE_STROKE, C.B, C.A, 0.5, 0.4, r * 0.02);
    c.save();
    c.rotate(((t * (k === 0 ? 0.8 : -0.5)) * 180 / Math.PI), r, r);
    c.drawArc(Skia.XYWHRect(r - rad, r - rad, rad * 2, rad * 2), 20, 200, false, op);
    c.restore();
  }
  const sparks = 8;
  for (let i = 0; i < sparks; i++) {
    const a = t * 0.9 + (i / sparks) * 2 * Math.PI;
    const rad = r * 0.9 * (1 + 0.04 * Math.sin(t * 4 + i));
    c.drawCircle(r + Math.cos(a) * rad, r + Math.sin(a) * rad, r * 0.025, paintMix(C.p5, STYLE_FILL, C.B, [1, 1, 1], 0.25, 0.5 + 0.3 * en));
  }
}

/* --------------------------------- gooey --------------------------------- */

function drawGooey(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  const blobs = 9;
  const path = Skia.Path.Make();
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * 2 * Math.PI;
    const wig = fbm(Math.cos(a) * 2 + t * 0.7, Math.sin(a) * 2 - t * 0.5);
    const rad = r * (0.72 + 0.16 * Math.sin(a * 3 + t * 1.4) + 0.12 * (wig - 0.5) + 0.2 * en * (0.5 + 0.5 * Math.sin(t * 3)));
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  path.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 0; i < blobs; i++) {
    const n = (i + 1) % blobs;
    const mx = (pts[i]![0] + pts[n]![0]) / 2;
    const my = (pts[i]![1] + pts[n]![1]) / 2;
    path.quadTo(mx + (pts[n]![1] - pts[i]![1]) * 0.18, my - (pts[n]![0] - pts[i]![0]) * 0.18, pts[n]![0], pts[n]![1]);
  }
  path.close();
  softFill(c, C.p1, r, r, r * 0.95, C.A, C.B, 0.55, 0.22 + 0.2 * en);
  const blob = radialPaint(C.p2, C.B, C.A, null, -r * 0.2, -r * 0.18, r * 1.1);
  blob.setAlphaf(0.92);
  c.save();
  c.translate(r, r);
  c.drawPath(path, blob);
  const spec = paintMix(C.p3, STYLE_FILL, [1, 1, 1], C.A, 0.35, 0.4);
  c.drawOval(Skia.XYWHRect(-r * 0.4, -r * 0.42, r * 0.5, r * 0.26), spec);
  c.restore();
}

/* --------------------------------- plasma -------------------------------- */

function drawPlasma(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  const palette: Array<V3> = [
    [C.A[0] * 0.6, C.A[1] * 0.6, C.A[2] * 0.6],
    C.A,
    [(C.A[0] + C.B[0]) / 2, (C.A[1] + C.B[1]) / 2, (C.A[2] + C.B[2]) / 2],
    C.B,
    [C.B[0] + (1 - C.B[0]) * 0.45, C.B[1] + (1 - C.B[1]) * 0.45, C.B[2] + (1 - C.B[2]) * 0.45],
  ];
  const distortion = 0.42 + 0.5 * en;
  const swirl = t * (0.2 + 0.3 * en);
  const mask = shaderPaint(5, `plasma-mask:${r}`, (p) => {
    p.setStyle(STYLE_FILL);
    p.setShader(
      Skia.Shader.MakeRadialGradient(
        Skia.Point(r, r),
        r,
        [rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.35)],
        [0.35, 1],
        TILE_CLAMP,
      ),
    );
  });
  c.save();
  c.clipRRect(gClip(C.s2, r), CLIP_COVER, true);
  for (let i = 0; i < palette.length; i++) {
    const ang = (i / palette.length) * 2 * Math.PI + swirl * 0.15;
    const w = 0.8 + distortion * 0.4 * Math.sin(t * 0.5 + i * 1.7);
    const cx = r + Math.cos(ang) * r * 0.55 * (0.75 + distortion * 0.25 * Math.sin(t * 0.3 + i * 2.3));
    const cy = r + Math.sin(ang) * r * 0.55 * (0.75 + distortion * 0.25 * Math.cos(t * 0.26 + i * 1.9));
    const q = palette[i]!;
    softFill(c, C.p1, cx, cy, r * 0.5 * w, q, q, 0, 0.5 + 0.2 * en);
  }
  c.drawCircle(r, r, r, mask);
  c.restore();
}

/* --------------------------------- galaxy -------------------------------- */

function drawGalaxy(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  const body = radialPaint(C.p1, C.B, C.A, [C.A[0] * 0.3, C.A[1] * 0.3, C.A[2] * 0.45], r * 0.75, r * 0.7, r * 1.15);
  body.setAlphaf(0.9);
  c.drawCircle(r, r, r * 0.96, body);
  for (let i = 0; i < 2; i++) {
    const cx = r + Math.cos(t * 0.13 + i * 2.4) * r * 0.28;
    const cy = r + Math.sin(t * 0.11 + i * 3.9) * r * 0.3;
    softFill(c, C.p2, cx, cy, r * 0.5, C.B, C.A, 0.55, 0.34 + 0.15 * en);
  }
  const star = paintMix(C.p3, STYLE_FILL, C.B, [1, 1, 1], 0.7, 1);
  const stars = 150;
  for (let i = 0; i < stars; i++) {
    const a = hash1(i) * 2 * Math.PI;
    const rr = Math.sqrt(hash1(i + 99)) * r * 0.92;
    const blink = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i * 1.3));
    setBlend(star, C.B[0], C.B[1], C.B[2], 0.25 + 0.6 * blink * (0.4 + 0.6 * en));
    c.drawCircle(r + Math.cos(a) * rr, r + Math.sin(a) * rr, r * (0.008 + (i % 3) * 0.006), star);
  }
  const rim = sweepPaint(C.p4, r, r, [C.A, C.B, C.A], [1, 1, 1], [0, 0.5, 1], r * 0.028);
  c.drawCircle(r, r, r * 0.94, rim);
  const spec = paintMix(C.p5, STYLE_FILL, [1, 1, 1], C.A, 0.6, 0.55);
  c.drawOval(Skia.XYWHRect(r * 0.22, r * 0.14, r * 0.66, r * 0.3), spec);
  c.drawOval(Skia.XYWHRect(r * 0.16, r * 0.1, r * 0.78, r * 0.38), paintMix(C.p5, STYLE_FILL, [1, 1, 1], C.A, 0.6, 0.22));
}

/* --------------------------------- nebula -------------------------------- */

function drawNebula(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  const base = radialPaint(C.p1, C.A, C.B, [C.B[0] * 0.5, C.B[1] * 0.5, C.B[2] * 0.75], r, r, r);
  c.save();
  c.clipRRect(gClip(C.s2, r), CLIP_COVER, true);
  c.drawCircle(r, r, r, base);
  const layers = 6;
  const flow = t * 0.22 * (0.5 + en);
  for (let k = 0; k < layers; k++) {
    const f = 1 - k / (layers + 0.5);
    const path = Skia.Path.Make();
    const seg = 44;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * 2 * Math.PI;
      const nz = fbm(Math.cos(a) * 2.2 + flow, Math.sin(a) * 2.2 - flow * 0.6);
      const disp = (nz - 0.5) * 0.34 * (0.35 + en);
      const rad = r * (0.16 + f * 0.82 + disp);
      const x = r + Math.cos(a) * rad;
      const y = r + Math.sin(a) * rad;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.close();
    const p = paintMix(C.p2, STYLE_FILL, C.A, C.B, clamp01(k / (layers - 1)), 0.5 + k * 0.06);
    c.drawPath(path, p);
  }
  const rim = paintMix(C.p3, STYLE_STROKE, C.B, [1, 1, 1], 0.4, 0.8 + 0.2 * en, r * 0.05);
  c.drawCircle(r, r, r * 0.98, rim);
  c.restore();
}

/* -------------------------------- waveform ------------------------------- */

function drawWaveform(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  const path = Skia.Path.Make();
  const seg = 60;
  const rot = t * (C.st === 'thinking' ? 0.5 : 0.15);
  const base = r * (0.62 + 0.08 * Math.sin(t * 1.4));
  const ampMul = 0.05 + 0.55 * en;
  for (let i = 0; i <= seg; i++) {
    const ang = (i / seg) * 2 * Math.PI;
    const a2 = ang + rot;
    const w = 0.5 * Math.sin(ang * 9 + Math.sin(t * 8) * 1.5) + 0.3 * Math.sin(ang * 22 - t * 14) + 0.2 * Math.sin(ang * 4 + t * 5);
    const rad = base + w * r * ampMul;
    const x = r + Math.cos(a2) * rad;
    const y = r + Math.sin(a2) * rad;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  softStrokePath(c, C.p1, path, C.A, C.B, 0.5 + 0.3 * Math.sin(t * 4), 0.9, r * 0.035);
  softFill(c, C.p2, r, r, r * 0.14, C.A, [1, 1, 1], 0.5, 0.5 + 0.4 * en);
}

/* ------------------------------- edge-glow ------------------------------- */

function drawEdgeGlow(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  const frame = sweepPaint(C.p1, r, r, [C.B, [1, 1, 1], C.A, C.B], [1, 1, 1, 1], [0, 0.3, 0.7, 1], r * 0.09);
  c.save();
  c.rotate((t * 0.5) * 180 / Math.PI, r, r);
  c.drawCircle(r, r, r * 0.92, frame);
  c.restore();
  softFill(c, C.p2, r, r, r * 0.86, C.A, C.B, 0.4, 0.3 + 0.4 * en);
  c.drawCircle(r, r, r * 0.5, paintMix(C.p3, STYLE_FILL, C.A, C.B, 0.35, 0.35));
}

/* ------------------------------- iridescent ------------------------------ */

function drawIridescent(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  const flow = t * (C.st === 'speaking' ? 1.1 : C.st === 'listening' ? 0.7 : C.st === 'thinking' ? 0.45 : 0.22);
  c.save();
  c.clipRRect(gClip(C.s2, r), CLIP_COVER, true);
  for (let i = 0; i < 4; i++) {
    const rad = r * (0.12 + i * 0.24);
    const th = fbm(Math.cos(t * 0.4 + i * 1.3) * 1.5, Math.sin(t * 0.35 + i) * 1.5) * 1.7 + t * 0.1 + i * 0.33;
    const film: V3 = [
      lerp(C.A[0], C.B[0], 0.5 + 0.5 * Math.cos(th * 6.28318)),
      lerp(C.A[1], C.B[1], 0.5 + 0.5 * Math.cos(th * 6.28318)),
      lerp(C.A[2], C.B[2], 0.5 + 0.5 * Math.cos(th * 6.28318)),
    ];
    softFill(c, C.p1, r + Math.cos(flow * 0.5 + i * 2.4) * rad * 0.25, r + Math.sin(flow * 0.4 + i * 2.4) * rad * 0.25, rad, film, C.A, 0, 0.45 + 0.3 * en);
  }
  const sweep = sweepPaint(C.p2, r, r, [[1, 1, 1], C.B, [1, 1, 1], [1, 1, 1]], [0.9, 0, 0.55, 0], [0.35, 0.5, 0.6, 0.75], r * 0.1);
  c.save();
  c.rotate((t * 0.8) * 180 / Math.PI, r, r);
  c.drawCircle(r, r, r * 0.9, sweep);
  c.restore();
  c.restore();
}

/* ------------------------------- liquid metal ---------------------------- */

function drawLiquidMetal(C: Ctx): void {
  'worklet';
  const { c, r, t } = C;
  const en = energyFor(C.lvl, C.st, t);
  const metal: V3 = [C.A[0] + (1 - C.A[0]) * 0.25, C.A[1] + (1 - C.A[1]) * 0.25, C.A[2] + (1 - C.A[2]) * 0.25];
  const blobs = 7;
  c.save();
  c.clipRRect(gClip(C.s2, r), CLIP_COVER, true);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * 2 * Math.PI;
    const nz = fbm(Math.cos(a) * 2 + t * 0.6, Math.sin(a) * 2 - t * 0.45);
    const rad = r * (0.78 + 0.1 * Math.sin(a * 2.4 + t * 1.6) + 0.08 * (nz - 0.5) * (1 + en));
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  const path = Skia.Path.Make();
  path.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 0; i < blobs; i++) {
    const n = (i + 1) % blobs;
    path.quadTo((pts[i]![0] + pts[n]![0]) / 2, (pts[i]![1] + pts[n]![1]) / 2, pts[n]![0], pts[n]![1]);
  }
  path.close();
  const fillBody = radialPaint(C.p1, metal, C.A, [0.08, 0.1, 0.16], -r * 0.25, -r * 0.3, r * 1.5);
  c.save();
  c.translate(r, r);
  c.drawPath(path, fillBody);
  c.drawPath(path, paintMix(C.p2, STYLE_STROKE, metal, [1, 1, 1], 0.4, 0.5, r * 0.05));
  const spec = paintMix(C.p3, STYLE_FILL, [1, 1, 1], metal, 0.7, 0.5);
  for (let i = 0; i < 3; i++) {
    const a = t * 0.3 + i * 2.1;
    const x = Math.cos(a) * r * 0.34;
    const y = Math.sin(a) * r * 0.34;
    c.drawOval(Skia.XYWHRect(x - r * 0.3, y - r * 0.05, r * 0.6, r * 0.1), spec);
  }
  c.restore();
  c.restore();
}

/* ------------------------------- dispatcher ------------------------------ */

export function recordGalleryPicture(
  style: OrbStyleId,
  size: number,
  t: number,
  lvl: number,
  st: GalleryState,
  colorFrom: V3,
  colorTo: V3,
): SkPicture {
  'worklet';
  console.log('[gallery] rec-start', style, size, st, t.toFixed(2), lvl.toFixed(2));
  const rec = Skia.PictureRecorder();
  const canvas = rec.beginRecording(gRect(size));
  const r = size / 2;
  const C: Ctx = {
    c: canvas,
    r,
    t,
    lvl,
    st,
    A: colorFrom,
    B: colorTo,
    p1: 1,
    p2: 2,
    p3: 3,
    p4: 4,
    p5: 5,
    s2: r,
  };
  switch (style) {
    case 'pulse': drawPulse(C); break;
    case 'glass': drawGlass(C); break;
    case 'pixel': drawPixel(C); break;
    case 'particles': drawParticles(C); break;
    case 'equalizer': drawEqualizer(C); break;
    case 'aurora': drawAurora(C); break;
    case 'halo': drawHalo(C); break;
    case 'gooey': drawGooey(C); break;
    case 'plasma': drawPlasma(C); break;
    case 'galaxy': drawGalaxy(C); break;
    case 'nebula': drawNebula(C); break;
    case 'waveform': drawWaveform(C); break;
    case 'edge-glow': drawEdgeGlow(C); break;
    case 'iridescent': drawIridescent(C); break;
    case 'liquid-metal': drawLiquidMetal(C); break;
  }
  const pic = rec.finishRecordingAsPicture();
  console.log('[gallery] rec-done', style);
  return pic;
}