// Semantic Material3 color scheme — ported from "osamah agent" (ui/theme/Theme.kt)
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  LightCanvas,
  LightSurface,
  LightSurfaceGlass,
  LightBorder,
  LightTextPrimary,
  LightTextSecondary,
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

const lightColorScheme: MaterialColorScheme = {
  primary: CyanNeon,
  onPrimary: '#001014',
  primaryContainer: '#D8F8FA',
  onPrimaryContainer: '#08343A',
  secondary: DeepViolet,
  onSecondary: '#FFFFFF',
  secondaryContainer: '#EDE3FF',
  onSecondaryContainer: '#32115E',
  tertiary: EmeraldGlow,
  onTertiary: '#06251A',
  background: LightCanvas,
  onBackground: LightTextPrimary,
  surface: LightSurface,
  onSurface: LightTextPrimary,
  surfaceVariant: LightSurfaceGlass,
  surfaceContainer: '#EEF2F7',
  onSurfaceVariant: LightTextSecondary,
  outline: LightBorder,
  error: Red,
  onError: '#FFFFFF',
};

const THEME_KEY = 'osamah:theme';

export interface Theme {
  colors: MaterialColorScheme;
  typography: typeof typography;
  isDark: boolean;
  setThemeMode: (mode: 'dark' | 'light') => void;
}

const ThemeContext = createContext<Theme>({
  colors: darkColorScheme,
  typography,
  isDark: true,
  setThemeMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') setMode(stored);
    }).catch(() => {});
  }, []);
  const theme = useMemo<Theme>(
    () => ({
      colors: mode === 'light' ? lightColorScheme : darkColorScheme,
      typography,
      isDark: mode === 'dark',
      setThemeMode: (next) => {
        setMode(next);
        AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
      },
    }),
    [mode]
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
