import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon, DeepViolet, AmberGlow } from '@/theme/colors';
import { GlassCard } from '@/theme/GlassComponents';
import { useI18n } from '@/i18n/provider';
import { formatHijri } from '@/utils/hijri';

const GREG_MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const GREG_MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GREG_WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const GREG_WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ROW_H = 52;
const SLIDE_MS = 5000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** One rectangular card showing time + dates as a continuous vertical ticker:
 *  clock → Gregorian+Hijri year → Gregorian date → Hijri date, no titles.
 *  Motion uses React Native's core Animated (native driver) so it always runs
 *  in Expo Go — the first slide is duplicated at the end for a seamless loop. */
export function DateTimeCard() {
  const { colors } = useTheme();
  const { lang } = useI18n();
  const isAr = lang === 'ar';

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = now.getHours();
  const mm = now.getMinutes();
  const ss = now.getSeconds();
  const hours12 = hh % 12 === 0 ? 12 : hh % 12;
  const suffix = hh >= 12 ? (isAr ? 'م' : 'PM') : isAr ? 'ص' : 'AM';
  const gregYear = now.getFullYear();

  const gregWeekday = isAr ? GREG_WEEKDAYS_AR[now.getDay()] : GREG_WEEKDAYS_EN[now.getDay()];
  const gregDate = isAr
    ? `${now.getDate()} ${GREG_MONTHS_AR[now.getMonth()]} ${gregYear}`
    : `${GREG_MONTHS_EN[now.getMonth()]} ${now.getDate()}, ${gregYear}`;

  const hijri = formatHijri(now);
  const hijriYear = hijri.hijri.year;
  const hijriText = isAr ? hijri.ar : hijri.en;
  const hijriWeekday = isAr ? hijri.weekdayAr : hijri.weekdayEn;

  const slides = [
    {
      key: 'time',
      icon: 'schedule',
      color: CyanNeon,
      tint: withAlpha(CyanNeon, 0.12),
      text: `${pad(hours12)}:${pad(mm)}:${pad(ss)} ${suffix}`,
    },
    {
      key: 'year',
      icon: 'date-range',
      color: DeepViolet,
      tint: withAlpha(DeepViolet, 0.15),
      text: isAr ? `${gregYear} / ${hijriYear}` : `${gregYear} · ${hijriYear}`,
    },
    {
      key: 'greg',
      icon: 'calendar-today',
      color: DeepViolet,
      tint: withAlpha(DeepViolet, 0.15),
      text: `${gregWeekday} · ${gregDate}`,
    },
    {
      key: 'hijri',
      icon: 'star',
      color: AmberGlow,
      tint: withAlpha(AmberGlow, 0.14),
      text: `${hijriWeekday} · ${hijriText}`,
    },
  ];

  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(progress, {
        toValue: ROW_H * slides.length,
        duration: SLIDE_MS * slides.length,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
      { resetBeforeIteration: true }
    );
    anim.start();
    return () => anim.stop();
  }, [progress, slides.length]);

  const translateY = progress.interpolate({
    inputRange: [0, ROW_H * slides.length],
    outputRange: [0, -(ROW_H * slides.length)],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.outer}>
      <GlassCard cornerRadius={18} style={styles.card}>
        <View
          style={[
            styles.window,
            { backgroundColor: withAlpha(colors.surfaceVariant, 0.45), borderColor: withAlpha(colors.outline, 0.2) },
          ]}>
          <Animated.View style={[styles.mover, { transform: [{ translateY }] }]}>
            {[...slides, slides[0]].map((s, i) => (
              <View key={`${s.key}-${i}`} style={styles.slide}>
                <View style={[styles.iconBox, { backgroundColor: s.tint }]}>
                  <MaterialIcons name={s.icon as any} size={14} color={s.color} />
                </View>
                <Text style={[styles.text, { color: colors.onSurface }]} numberOfLines={1}>
                  {s.text}
                </Text>
              </View>
            ))}
          </Animated.View>
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { width: '100%', paddingHorizontal: 20, marginTop: 4 },
  card: { width: '100%' },
  window: {
    height: ROW_H,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  mover: {},
  slide: {
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    ...(typography.bodyMedium as any),
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700' as any,
    fontVariant: ['tabular-nums'],
  },
});