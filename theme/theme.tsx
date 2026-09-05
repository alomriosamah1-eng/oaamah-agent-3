// Semantic Material3 color scheme — ported from "osamah agent" (ui/theme/Theme.kt)
import React, { createContext, useContext, useMemo } from 'react';
import {
  CyanNeon,
  ElectricBlue,
  DeepViolet,
  EmeraldGlow,
  AccentPurple,
  DarkCanvas,
  DarkSurface,
  DarkSurfaceGlass,
  DarkBorder,
  DarkTextPrimary,
  DarkTextSecondary,
  Red,
} from './colors';
import { typography } from './typography';

export interface MaterialColorScheme {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  surfaceContainer: string;
  onSurfaceVariant: string;
  outline: string;
  error: string;
  onError: string;
}

const darkColorScheme: MaterialColorScheme = {
  primary: CyanNeon,
  onPrimary: '#000000',
  primaryContainer: '#0E2233',
  onPrimaryContainer: '#FFFFFF',
  secondary: DeepViolet,
  onSecondary: '#FFFFFF',
  secondaryContainer: AccentPurple,
  onSecondaryContainer: '#FFFFFF',
  tertiary: EmeraldGlow,
  onTertiary: '#000000',
  background: DarkCanvas,
  onBackground: DarkTextPrimary,
  surface: DarkSurface,
  onSurface: DarkTextPrimary,
  surfaceVariant: DarkSurfaceGlass,
  surfaceContainer: '#172033',
  onSurfaceVariant: DarkTextSecondary,
  outline: DarkBorder,
  error: Red,
  onError: '#FFFFFF',
};

export interface Theme {
  colors: MaterialColorScheme;
  typography: typeof typography;
  isDark: boolean;
}

const ThemeContext = createContext<Theme>({
  colors: darkColorScheme,
  typography,
  isDark: true,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // التصميم "Futuristic Glassmorphism" داكن بطبيعته، فنثبّت الثيم الداكن دائماً.
  const theme = useMemo<Theme>(
    () => ({
      colors: darkColorScheme,
      typography,
      isDark: true,
    }),
    []
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}