// Prompt Maker — chat-style bubble that renders generated prompts (Markdown)
// exactly like the main chat bubbles, with an optional streaming state while
// the prompt is being written live. A copy button sits in the bubble header.

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { typography } from '@/theme/typography';
import { withAlpha } from '@/theme/colors';
import MarkdownText from './MarkdownText';
import CopyPromptButton from './CopyPromptButton';

const PromptBubble = ({ text, streaming }: { text: string; streaming?: boolean }) => {
  const { colors } = useTheme();
  const showHeader = text.length > 0 || streaming;
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.emoji}>🤖</Text>
      </View>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: withAlpha(colors.surface, 0.5),
            borderColor: withAlpha(colors.outline, 0.3),
          },
        ]}>
        {showHeader ? (
          <View style={styles.header}>
            <Text style={{ color: colors.onSurfaceVariant, ...(typography.labelSmall as any) }}>
              {streaming ? '…' : 'Prompt'}
            </Text>
            {text.length > 0 ? <CopyPromptButton text={text} compact /> : null}
          </View>
        ) : null}
        {streaming ? (
          <View style={styles.streamingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>…</Text>
          </View>
        ) : null}
        {text.length > 0 ? <MarkdownText text={text} /> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 4,
    paddingBottom: 10,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    padding: 4,
  },
  emoji: { fontSize: 16 },
  bubble: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  streamingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
});

export default PromptBubble;