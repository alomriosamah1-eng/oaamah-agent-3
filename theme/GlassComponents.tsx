// GlassComponents — ported from "osamah agent" (ui/components/GlassComponents.kt)
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from './theme';
import { typography, FontWeights } from './typography';
import { withAlpha, Green, CyanNeon } from './colors';

export function PressableCard({
  children,
  style,
  onPress,
  cornerRadius = 14,
  alpha = 0.5,
  borderColor,
  borderWidth = 1,
  width,
}: {
  children: React.ReactNode;
  style?: any;
  onPress?: () => void;
  cornerRadius?: number;
  alpha?: number;
  borderColor?: string;
  borderWidth?: number;
  width?: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          borderRadius: cornerRadius,
          backgroundColor: withAlpha(colors.surfaceVariant, alpha),
          borderWidth,
          borderColor: borderColor ?? withAlpha(colors.outline, 0.2),
          padding: 12,
          width,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}>
      {children}
    </Pressable>
  );
}

export function GlassCard({
  children,
  style,
  cornerRadius = 20,
}: {
  children: React.ReactNode;
  style?: any;
  cornerRadius?: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: cornerRadius,
          backgroundColor: withAlpha(colors.surfaceVariant, 0.7),
          borderWidth: 1,
          borderColor: withAlpha(colors.outline, 0.25),
          padding: 16,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function StatusCard({
  label,
  value,
  tone = 'ok',
  icon,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'idle';
  icon?: keyof typeof MaterialIcons.glyphMap;
}) {
  const { colors } = useTheme();
  const dotColor = tone === 'ok' ? Green : tone === 'warn' ? '#F59E0B' : colors.onSurfaceVariant;
  return (
    <View
      style={{
        borderRadius: 14,
        backgroundColor: withAlpha(colors.surfaceVariant, 0.55),
        borderWidth: 1,
        borderColor: withAlpha(colors.outline, 0.2),
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
      }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor }} />
      <View style={{ width: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.onSurfaceVariant, ...typography.labelSmall }}>{label}</Text>
        <Text style={{ color: colors.onSurface, ...typography.bodySmall, fontWeight: FontWeights.semiBold }} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {icon ? <MaterialIcons name={icon} size={18} color={colors.onSurfaceVariant} /> : null}
    </View>
  );
}

export function QuickActionChip({
  title,
  icon,
  onPress,
  accent = CyanNeon,
}: {
  title: string;
  icon: keyof typeof MaterialIcons.glyphMap | React.ReactNode;
  onPress: () => void;
  accent?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          borderRadius: 16,
          backgroundColor: withAlpha(colors.surfaceVariant, 0.8),
          borderWidth: 1,
          borderColor: withAlpha(colors.outline, 0.2),
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      {typeof icon === 'string' ? <MaterialIcons name={icon as any} size={18} color={accent} /> : icon}
      <View style={{ width: 8 }} />
      <Text style={{ color: colors.onSurface, ...typography.labelLarge }}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({});