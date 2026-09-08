// Prompt Maker — Copy Prompt button. Copies the raw prompt text (not the
// preview) and flashes a confirmation state.

import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useI18n } from '@/i18n/provider';
import { CyanNeon, withAlpha } from '@/theme/colors';

const CopyPromptButton = ({ text, compact = false }: { text: string; compact?: boolean }) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Pressable
      onPress={onCopy}
      hitSlop={8}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: withAlpha(CyanNeon, 0.55),
          backgroundColor: withAlpha(CyanNeon, 0.12),
          paddingHorizontal: compact ? 8 : 12,
          paddingVertical: compact ? 4 : 6,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <MaterialIcons name={copied ? 'check' : 'content-copy'} size={13} color={CyanNeon} />
      <Text style={{ color: CyanNeon, fontSize: 12, fontWeight: '600' }}>
        {copied ? t('promptMaker.copied') : t('promptMaker.copy')}
      </Text>
    </Pressable>
  );
};

export default CopyPromptButton;