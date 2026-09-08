// Prompt Maker — generated prompt viewer: title, intent/quality tags, markdown
// rendering, copy button and the prompt actions row (regenerate / improve /
// shorten / expand / analyze). Read-only rendering of the produced prompt.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography } from '@/theme/typography';
import { withAlpha, CyanNeon, Amber, MagentaGlow, EmeraldGlow, Red } from '@/theme/colors';
import { useI18n, TKey } from '@/i18n/provider';
import type { PromptMakerOutput, PromptTransformOp } from '../types/prompt-types';
import MarkdownText from './MarkdownText';
import CopyPromptButton from './CopyPromptButton';

const INTENT_ICON: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  coding: 'code',
  research: 'travel-explore',
  agent: 'android',
  rag: 'storage',
  writing: 'edit',
  analysis: 'bar-chart',
  creative: 'palette',
  general: 'chat',
};

const INTENT_COLOR: Record<string, string> = {
  coding: CyanNeon,
  research: '#38BDF8',
  agent: MagentaGlow,
  rag: '#A78BFA',
  writing: Amber,
  analysis: EmeraldGlow,
  creative: '#F472B6',
  general: '#94A3B8',
};

const qualityColor = (score: number) => (score >= 80 ? EmeraldGlow : score >= 50 ? Amber : Red);

const PromptViewer = ({
  output,
  onTransform,
  onAnalyze,
  disabled,
}: {
  output: PromptMakerOutput;
  onTransform: (op: PromptTransformOp) => void;
  onAnalyze: () => void;
  disabled?: boolean;
}) => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const intentColor = INTENT_COLOR[output.intent] ?? CyanNeon;

  const typeText = (id: string) => {
    const txt = t(`promptMaker.types.${id}` as TKey);
    return txt.startsWith('promptMaker.types.') ? id : txt;
  };

  const metaBtn = (
    label: TKey,
    icon: keyof typeof MaterialIcons.glyphMap,
    color: string,
    onPress: () => void,
  ) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionBtn,
        { borderColor: withAlpha(color, 0.45), opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
      ]}>
      <MaterialIcons name={icon} size={15} color={color} />
      <Text style={{ color, fontSize: 13 }}>{t(label)}</Text>
    </Pressable>
  );

  const actions: Array<[PromptTransformOp, TKey, keyof typeof MaterialIcons.glyphMap, string]> = [
    ['regenerate', 'promptMaker.regenerate', 'refresh', colors.onSurface],
    ['improve', 'promptMaker.improve', 'trending-up', colors.onSurface],
    ['shorten', 'promptMaker.shorten', 'remove-circle-outline', colors.onSurface],
    ['expand', 'promptMaker.expand', 'add-circle-outline', colors.onSurface],
  ];

  return (
    <View style={[styles.card, { borderColor: withAlpha(colors.outline, 0.4), backgroundColor: withAlpha(colors.surface, 0.55) }]}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: colors.onSurface }]}>{output.title}</Text>
        <CopyPromptButton text={output.prompt} />
      </View>

      <View style={styles.tagsRow}>
        <View style={[styles.tag, { borderColor: withAlpha(intentColor, 0.55), backgroundColor: withAlpha(intentColor, 0.12) }]}>
          <MaterialIcons name={INTENT_ICON[output.intent] ?? 'chat'} size={13} color={intentColor} />
          <Text style={{ color: intentColor, fontSize: 12, fontWeight: '600' }}>{typeText(output.intent)}</Text>
        </View>
        <View style={[styles.tag, { borderColor: withAlpha(qualityColor(output.quality.score), 0.55), backgroundColor: withAlpha(qualityColor(output.quality.score), 0.1) }]}>
          <Text style={{ color: qualityColor(output.quality.score), fontSize: 12, fontWeight: '700' }}>
            {t('promptMaker.quality')}: {output.quality.score}/100
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <MarkdownText text={output.prompt} />
      </View>

      <View style={styles.actionsRow}>
        {actions.map(([op, label, icon, color]) => (
          <View key={op}>{metaBtn(label, icon, color, () => onTransform(op))}</View>
        ))}
        {metaBtn('promptMaker.analyze', 'speed', MagentaGlow, onAnalyze)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: {
    flexShrink: 1,
    ...(typography.titleMedium as any),
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  body: { gap: 4 },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
});

export default PromptViewer;