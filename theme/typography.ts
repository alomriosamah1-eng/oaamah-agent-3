// Material3 Typography — ported from "osamah agent" (ui/theme/Type.kt)
import { TextStyle } from 'react-native';

type FontWeight = TextStyle['fontWeight'];

export interface TextScale {
  [key: string]: TextStyle;
}

// cap: يمنع iOS Dynamic Type من تكبير الواجهة عن حدودها المنطقية
const cap = { maxFontSizeMultiplier: 1.25 };

export const typography: TextScale = {
  headlineMedium: { fontSize: 28, lineHeight: 36, fontWeight: '400' as FontWeight, ...cap },
  headlineSmall: { fontSize: 24, lineHeight: 32, fontWeight: '400' as FontWeight, ...cap },
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: '400' as FontWeight, ...cap },
  titleMedium: { fontSize: 16, lineHeight: 24, fontWeight: '500' as FontWeight, letterSpacing: 0.15, ...cap },
  titleSmall: { fontSize: 14, lineHeight: 20, fontWeight: '500' as FontWeight, ...cap },
  bodyLarge: { fontSize: 16, lineHeight: 24, fontWeight: '400' as FontWeight, letterSpacing: 0.5, ...cap },
  bodyMedium: { fontSize: 14, lineHeight: 20, fontWeight: '400' as FontWeight, letterSpacing: 0.25, ...cap },
  bodySmall: { fontSize: 12, lineHeight: 16, fontWeight: '400' as FontWeight, letterSpacing: 0.4, ...cap },
  labelLarge: { fontSize: 14, lineHeight: 20, fontWeight: '500' as FontWeight, letterSpacing: 0.1, ...cap },
  labelMedium: { fontSize: 12, lineHeight: 16, fontWeight: '500' as FontWeight, letterSpacing: 0.5, ...cap },
  labelSmall: { fontSize: 11, lineHeight: 16, fontWeight: '500' as FontWeight, letterSpacing: 0.5, ...cap },
};

/** أوزان تُستخدم فوق الأنماط (FontWeight.Bold / SemiBold ...) */
export const FontWeights = {
  normal: '400' as FontWeight,
  medium: '500' as FontWeight,
  semiBold: '600' as FontWeight,
  bold: '700' as FontWeight,
};