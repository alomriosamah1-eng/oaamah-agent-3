import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography } from '@/theme/typography';
import { withAlpha } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';
import { TaskTypeSelector } from '@/components/TaskTypeSelector';
import { TaskLevel } from '@/utils/taskLevel';

const MessageInput = ({
  onShouldSend,
  disabled,
}: {
  onShouldSend: (value: string, taskType?: TaskLevel) => void;
  disabled?: boolean;
}) => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [taskType, setTaskType] = useState<TaskLevel>('normal');
  const inputRef = useRef<TextInput>(null);

  const send = async () => {
    if (text.length < 1) return;
    await onShouldSend(text, taskType);
    setText('');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: withAlpha(colors.surfaceVariant, 0.55) }]}>
        <View style={styles.buttonView}>
          <TouchableOpacity
            onPress={send}
            disabled={disabled}
            style={[styles.buttonSend, { backgroundColor: disabled ? withAlpha(colors.primary, 0.4) : colors.primary }]}>
            {disabled ? <ActivityIndicator size="small" color="#000" /> : <Ionicons name="arrow-up" size={22} color="#000" />}
          </TouchableOpacity>
        </View>
        <TaskTypeSelector onChange={setTaskType} />
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: colors.onSurface }]}
          value={text}
          onChangeText={(v) => {
            setText(v);
          }}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={colors.onSurfaceVariant}
          multiline={false}
          returnKeyType="send"
          onSubmitEditing={send}
        />
        {text.length > 0 ? (
          <TouchableOpacity onPress={() => setText('')} style={styles.clearButton}>
            <Ionicons name="close-circle-outline" size={22} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        ) : (
          <View style={styles.clearButton}>
            <Text style={{ color: withAlpha(colors.onSurface, 0.4), ...(typography.labelSmall as any) }}>{t('chat.sendHint')}</Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 32,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingStart: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 16,
    paddingHorizontal: 8,
  },
  clearButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonView: {
    alignItems: 'center',
  },
  buttonSend: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
export default MessageInput;