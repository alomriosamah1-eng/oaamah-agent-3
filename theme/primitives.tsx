// أساسيات واجهة تشابه مكونات Material3 — ported from "osamah agent"
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ViewStyle, TextStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from './theme';
import { typography, FontWeights } from './typography';
import { withAlpha, CyanNeon } from './colors';

export type IconName = keyof typeof MaterialIcons.glyphMap;

export function Spacer({ w = 0, h = 0 }: { w?: number; h?: number }) {
  return <View style={{ width: w, height: h }} />;
}

export function Divider({ style, height = 1 }: { style?: ViewStyle; height?: number }) {
  const { colors } = useTheme();
  return <View style={[{ height, backgroundColor: withAlpha(colors.outline, 0.25) }, style]} />;
}

export function FilledButton({
  label,
  icon,
  onPress,
  backgroundColor,
  textColor = '#000000',
  disabled = false,
  style,
}: {
  label?: string;
  icon?: IconName;
  onPress: () => void;
  backgroundColor?: string;
  textColor?: string;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filledBtn,
        {
          backgroundColor: backgroundColor ?? colors.primary,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}>
      {icon ? <MaterialIcons name={icon} size={18} color={textColor} /> : null}
      {label ? (
        <Text style={[{ color: textColor, ...typography.labelLarge, fontWeight: FontWeights.bold }]}>{label}</Text>
      ) : null}
    </Pressable>
  );
}

export function OutlinedButton({
  label,
  icon,
  onPress,
  disabled = false,
  color,
  style,
}: {
  label?: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const c = color ?? colors.primary;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.outlinedBtn,
        { borderColor: withAlpha(colors.outline, 0.5), opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
        style,
      ]}>
      {icon ? <MaterialIcons name={icon} size={18} color={c} /> : null}
      {label ? <Text style={[{ color: c, ...typography.labelLarge, fontWeight: FontWeights.medium }]}>{label}</Text> : null}
    </Pressable>
  );
}

export function TextButton({ label, onPress, color }: { label: string; onPress: () => void; color?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Text style={{ color: color ?? colors.primary, ...typography.labelSmall, fontWeight: FontWeights.semiBold }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color,
  size = 24,
  label,
}: {
  icon: IconName;
  onPress: () => void;
  color?: string;
  size?: number;
  label?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.6 : 1 }]}
      accessibilityLabel={label ?? icon}>
      <MaterialIcons name={icon} size={size} color={color ?? colors.onSurface} />
    </Pressable>
  );
}

/** FilterChip — اختيار من مجموعة */
export function Chip({
  label,
  icon,
  selected,
  onPress,
  accent = CyanNeon,
  style,
}: {
  label: string;
  icon?: IconName;
  selected?: boolean;
  onPress: () => void;
  accent?: string;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? withAlpha(colors.primaryContainer, 0.55) : withAlpha(colors.surfaceVariant, 0.7),
          borderColor: selected ? accent : withAlpha(colors.outline, 0.25),
        },
        pressed && { opacity: 0.75 },
        style,
      ]}>
      {icon ? <MaterialIcons name={icon} size={14} color={selected ? accent : colors.onSurfaceVariant} /> : null}
      <Text
        style={[{ color: selected ? accent : colors.onSurface, ...typography.labelSmall }, icon ? { marginHorizontal: 4 } : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** حقل نصي شفاف */
export function ThemedField({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  maxLines,
  singleLine,
  style,
  placeholderTextColor,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLines?: number;
  singleLine?: boolean;
  style?: ViewStyle | TextStyle;
  placeholderTextColor?: string;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor ?? colors.onSurfaceVariant}
      multiline={multiline}
      maxLength={maxLines}
      numberOfLines={singleLine ? 1 : undefined}
      style={[{ color: colors.onSurface, ...typography.bodyMedium, paddingVertical: 8 }, style as any]}
    />
  );
}

export function SectionTitle({ text, style }: { text: string; style?: TextStyle }) {
  const { colors } = useTheme();
  return <Text style={[{ color: colors.onBackground, ...typography.titleMedium, fontWeight: FontWeights.bold }, style]}>{text}</Text>;
}

const styles = StyleSheet.create({
  filledBtn: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  outlinedBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chip: {
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
  },
});