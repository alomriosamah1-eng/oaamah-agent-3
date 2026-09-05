import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { Message, Role } from '@/utils/Interfaces';
import { useTheme } from '@/theme/theme';
import { typography } from '@/theme/typography';
import { withAlpha } from '@/theme/colors';
import { useI18n, TKey } from '@/i18n/provider';

type ChatMessageProps = Message & { error?: string; loading?: boolean; loadingState?: string };

const chatReplyState = (state?: string) => state === 'searching' || state === 'error' || state === 'preparing';

const ChatMessage = ({ role, content, imageUrl, error, prompt, loading, loadingState }: ChatMessageProps) => {
  const { colors } = useTheme();
  const { t } = useI18n();

  if (imageUrl) {
    return (
      <View style={styles.messageRow}>
        <View style={styles.avatarContainer}>
          <Ionicons name="image-outline" size={16} color="#fff" />
        </View>
        <View style={styles.messageContent}>
          <Image source={{ uri: imageUrl }} style={styles.generatedImage} />
          {prompt && (
            <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any), marginTop: 6 }}>{prompt}</Text>
          )}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.messageRow}>
        <View style={[styles.avatarContainer, { backgroundColor: withAlpha(colors.error, 0.9) }]}>
          <Ionicons name="alert" size={16} color="#fff" />
        </View>
        <View style={styles.messageContent}>
          <Text style={{ color: colors.onSurface }}>{error}</Text>
        </View>
      </View>
    );
  }

  if (loading && chatReplyState(loadingState)) {
    return (
      <View style={styles.messageRow}>
        <View style={styles.avatarContainer}>
          <Text style={styles.robotEmoji}>🤖</Text>
        </View>
        <View style={styles.messageContent}>
          <Text style={{ color: colors.onSurfaceVariant }}>{t('chat.loadingSearching')}</Text>
        </View>
      </View>
    );
  }

  if (role == Role.Bot && content.trim().length === 0) {
    return (
      <View style={styles.messageRow}>
        <View style={styles.avatarContainer}>
          <Text style={styles.robotEmoji}>🤖</Text>
        </View>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const isUser = role === Role.User;

  return (
    <View style={styles.messageRow}>
      <View style={styles.avatarContainer}>
        {isUser ? <Ionicons name="person" size={16} color="#fff" /> : <Text style={styles.robotEmoji}>🤖</Text>}
      </View>
      <View style={styles.messageContent}>
        {!isUser && loading && loadingState && !chatReplyState(loadingState) && (
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>
            {t(`chat.loading.${loadingState}` as TKey)}
          </Text>
        )}
        <Text
          style={[
            { color: colors.onSurface },
            isUser ? styles.userText : styles.botText,
          ]}
          selectable>
          {content}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 4,
    paddingBottom: 24,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'flex-start',
  },
  robotEmoji: { fontSize: 16 },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    padding: 4,
  },
  messageContent: {
    flexShrink: 1,
    gap: 4,
  },
  userText: {
    fontSize: 17,
    lineHeight: 23,
  },
  botText: {
    fontSize: 16,
    lineHeight: 23,
  },
  generatedImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
});
export default ChatMessage;