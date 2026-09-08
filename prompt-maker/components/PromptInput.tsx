// Prompt Maker — user request input. Own build button + multiline field.

import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography } from '@/theme/typography';
import { withAlpha, CyanNeon } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';

const PromptInput = ({
  onSubmit,
  disabled,
  externalValue,
  onExternalValueChange,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  externalValue?: string;
  onExternalValueChange?: (text: string) => void;
}) => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [local, setLocal] = useState('');

  const controlled = externalValue != null;
  const value = controlled ? externalValue : local;
  const setValue = (v: string) => {
    if (controlled) onExternalValueChange?.(v);
    else setLocal(v);
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <View
      style={[
        styles.wrap,
        {
          borderColor: withAlpha(colors.primary, 0.35),
          backgroundColor: withAlpha(colors.surface, 0.7),
        },
      ]}>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={t('promptMaker.placeholder')}
        placeholderTextColor={colors.onSurfaceVariant}
        multiline
        style={[
          styles.input,
          { color: colors.onSurface },
        ]}
      />
      <Pressable
        onPress={() => {
          if (!canSend) return;
          onSubmit(value.trim());
          if (!controlled) setLocal('');
        }}
        disabled={!canSend}
        hitSlop={6}
        style={({ pressed }) => [
          styles.send,
          {
            backgroundColor: canSend ? CyanNeon : withAlpha(colors.outline, 0.25),
            opacity: pressed ? 0.7 : 1,
          },
        ]}>
        <MaterialIcons name="auto-awesome" size={18} color={canSend ? '#001014' : colors.onSurfaceVariant} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 140,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 4,
    ...(typography.bodyMedium as any),
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default PromptInput;