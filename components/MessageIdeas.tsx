import { Text, ScrollView, TouchableOpacity, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';

const Page = ({ onSelectCard }: { onSelectCard: (message: string) => void }) => {
  const { colors } = useTheme();
  const { t } = useI18n();

  const PredefinedMessages = [
    { title: t('chat.idea1Title'), text: t('chat.idea1Text') },
    { title: t('chat.idea2Title'), text: t('chat.idea2Text') },
    { title: t('chat.idea3Title'), text: t('chat.idea3Text') },
  ];

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingVertical: 10,
          gap: 12,
        }}>
        {PredefinedMessages.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.card, { backgroundColor: withAlpha(colors.surfaceVariant, 0.7), borderColor: withAlpha(colors.outline, 0.25) }]}
            onPress={() => onSelectCard(`${item.title} ${item.text}`)}>
            <View style={styles.cardInner}>
              <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.semiBold }}>
                {item.title}
              </Text>
              <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{item.text}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardInner: { gap: 4, width: 200 },
});
export default Page;