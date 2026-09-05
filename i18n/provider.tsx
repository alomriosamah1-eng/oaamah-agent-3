import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LangKey, strings } from './strings';

const PREFIX = 'chatgpt:';
export const LANG_KEY = 'language';

type StringTable = typeof strings.ar;

type DeepKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${DeepKeys<T[K]>}`;
}[keyof T & string];

export type TKey = DeepKeys<StringTable>;

function getPath(obj: any, path: string): string {
  return path
    .split('.')
    .reduce((acc: any, key) => (acc == null ? acc : acc[key]), obj) as string;
}

interface I18nCtx {
  lang: LangKey;
  setLang: (lang: LangKey) => void;
  t: (key: TKey) => string;
}

const I18nContext = createContext<I18nCtx>({
  lang: 'ar',
  setLang: () => {},
  t: () => '',
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangKey>('ar');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(PREFIX + LANG_KEY);
        if (stored === 'ar' || stored === 'en') setLangState(stored);
      } catch {
        // ignore; default to Arabic
      }
      setReady(true);
    })();
  }, []);

  const value = useMemo<I18nCtx>(
    () => ({
      lang,
      setLang: (next: LangKey) => {
        setLangState(next);
        AsyncStorage.setItem(PREFIX + LANG_KEY, next).catch(() => {});
      },
      t: (key: TKey) => getPath(strings[lang], key),
    }),
    [lang]
  );

  if (!ready) return null;

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}