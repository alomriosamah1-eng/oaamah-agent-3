import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon } from '@/theme/colors';
import { useI18n, TKey } from '@/i18n/provider';
import { TASK_LEVELS, TASK_LEVEL_ICONS, TaskLevel, loadTaskType, saveTaskType } from '@/utils/taskLevel';

const LABEL: Record<TaskLevel, TKey> = {
  normal: 'taskType.normal',
  medium: 'taskType.medium',
  complex: 'taskType.complex',
};

const SUBTITLE: Record<TaskLevel, TKey> = {
  normal: 'taskType.normalSubtitle',
  medium: 'taskType.mediumSubtitle',
  complex: 'taskType.complexSubtitle',
};

/** Task options as a compact button sitting next to the chat input; pressing it
 *  reveals the three options in a small floating panel above the field
 *  (absolute inside the input container). The options stack VERTICALLY, each
 *  showing its icon + title + one-line description. Self-contained: loads the
 *  persisted choice, saves on tap, reports changes up to attach the prompt
 *  directive. */
export function TaskTypeSelector({ onChange }: { onChange?: (level: TaskLevel) => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [level, setLevel] = useState<TaskLevel>('normal');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadTaskType().then((v) => {
      if (v) {
        setLevel(v);
        onChange?.(v);
      }
    });
  }, []);

  const pick = (next: TaskLevel) => {
    setLevel(next);
    saveTaskType(next).catch(() => {});
    onChange?.(next);
    setOpen(false);
  };

  return (
    <>
      {open && (
        <View style={[styles.menu, { backgroundColor: withAlpha(colors.surfaceVariant, 0.98) }]}>
          {TASK_LEVELS.map((key) => {
            const focused = level === key;
            return (
              <Pressable
                key={key}
                onPress={() => pick(key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: focused }}
                style={({ pressed }) => [
                  styles.chip,
                  { borderColor: focused ? withAlpha(CyanNeon, 0.75) : withAlpha(colors.outline, 0.25) },
                  focused && { backgroundColor: withAlpha(CyanNeon, 0.14) },
                  pressed && { opacity: 0.7 },
                ]}>
                <MaterialIcons
                  name={TASK_LEVEL_ICONS[key] as any}
                  size={13}
                  color={focused ? CyanNeon : colors.onSurfaceVariant}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: focused ? CyanNeon : colors.onSurface }]} numberOfLines={1}>
                    {t(LABEL[key])}
                  </Text>
                  <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
                    {t(SUBTITLE[key])}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={t(LABEL[level])}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [
          styles.btn,
          {
            borderColor: open ? withAlpha(CyanNeon, 0.8) : withAlpha(colors.outline, 0.3),
            backgroundColor: open ? withAlpha(CyanNeon, 0.14) : '#000',
          },
          pressed && { opacity: 0.7 },
        ]}>
        <MaterialIcons
          name={TASK_LEVEL_ICONS[level] as any}
          size={20}
          color={open || level !== 'normal' ? CyanNeon : colors.onSurfaceVariant}
        />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginEnd: 6,
  },
  menu: {
    position: 'absolute',
    bottom: 48,
    left: 8,
    right: 8,
    flexDirection: 'column',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  label: {
    ...(typography.labelSmall as any),
    fontWeight: FontWeights.bold,
  },
  subtitle: {
    ...(typography.labelSmall as any),
    fontSize: 9,
    opacity: 0.8,
  },
});