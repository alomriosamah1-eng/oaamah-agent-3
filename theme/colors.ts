// Futuristic Glassmorphism palette — ported from "osamah agent" (ui/theme/Color.kt)

// Branded accents
export const CyanNeon = '#00F0FF';
export const ElectricBlue = '#0070F3';
export const DeepViolet = '#7928CA';
export const MagentaGlow = '#FF0080';
export const EmeraldGlow = '#10B981';
export const AmberGlow = '#F59E0B';

// Dark Theme Canvas & Glass
export const DarkCanvas = '#0A0E17';
export const DarkSurface = '#111827';
export const DarkSurfaceGlass = 'rgba(31,41,55,0.80)';
export const DarkBorder = 'rgba(255,255,255,0.20)';
export const DarkTextPrimary = '#F9FAFB';
export const DarkTextSecondary = '#9CA3AF';

// Light Theme Canvas & Glass (kept for reference; app is always dark)
export const LightCanvas = '#F8FAFC';
export const LightSurface = '#FFFFFF';
export const LightSurfaceGlass = 'rgba(255,255,255,0.90)';
export const LightBorder = 'rgba(0,0,0,0.12)';
export const LightTextPrimary = '#0F172A';
export const LightTextSecondary = '#64748B';

// Accents
export const AccentBlue = '#2563EB';
export const AccentPurple = '#9333EA';
export const AccentCyan = '#06B6D4';

// Status / terminal colors
export const Red = '#EF4444';
export const RedDark = '#7F1D1D';
export const RedLight = '#FECACA';
export const Green = '#10B981';
export const GreenSoft = '#34D399';
export const Amber = '#F59E0B';
export const Sky = '#38BDF8';
export const Slate = '#64748B';
export const EditorBackground = '#0F172A';
export const EditorBar = '#1E293B';
export const TerminalBackground = '#020617';
export const EditorText = '#E2E8F0';
export const EditorMuted = '#94A3B8';
export const ErrorText = '#F87171';

/** تحويل لون hex + شفافية إلى rgba */
export function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgba')) return hex;
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}