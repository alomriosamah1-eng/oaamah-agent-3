import MessageInput from '@/components/MessageInput';
import { SPEAK_OUTPUT_KEY, storage } from '@/utils/Storage';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlatList } from 'react-native';
import ChatMessage from '@/components/ChatMessage';
import { Message, Role } from '@/utils/Interfaces';
import MessageIdeas from '@/components/MessageIdeas';
import { addChat, addMessage, getMessages } from '@/utils/Database';
import { useSQLiteContext } from 'expo-sqlite';
import { buildHistoryPrompt } from '@/utils/Opencode';
import { AgentUnavailableError, chatStream, getSelectedZenModel, OSAMAH_SYSTEM } from '@/utils/OpenCodeAgent';
import { archiveToServer, messagesToMarkdown, saveMarkdownAsPdf } from '@/utils/Pdf';
import { addSavedFile } from '@/utils/savedFiles';
import { TaskLevel, taskLevelDirective } from '@/utils/taskLevel';
import * as Speech from 'expo-speech';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { withAlpha } from '@/theme/colors';
import { typography, FontWeights } from '@/theme/typography';
import { useI18n } from '@/i18n/provider';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ChatPage = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { bottom } = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [height, setHeight] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  let { id } = useLocalSearchParams<{ id: string }>();

  const [chatId, _setChatId] = useState(id);
  const chatIdRef = useRef(chatId);
  function setChatId(newId: string) {
    chatIdRef.current = newId;
    _setChatId(newId);
  }

  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (id) {
      getMessages(db, parseInt(id)).then((res) => {
        setMessages(res);
      });
    }
  }, [id]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const onLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    setHeight(height / 2);
  };

  const onShouldSend = async (text: string, taskType?: TaskLevel) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setMessages((prev) => [
      ...prev,
      { role: Role.User, content: trimmed },
      { role: Role.Bot, content: '' },
    ]);

    let chatID = chatIdRef.current;
    try {
      if (!chatID) {
        const res = await addChat(db, trimmed);
        chatID = res.lastInsertRowId.toString();
        setChatId(chatID);
      }
      await addMessage(db, parseInt(chatID), { content: trimmed, role: Role.User });
    } catch (err) {
      Alert.alert(t('chat.saveErrorTitle'), t('chat.saveErrorBody'));
    }

    const history = messagesRef.current.filter((m) => m.content && m.content.trim() !== '');
    const directive = taskType ? taskLevelDirective(taskType) : '';
    // Task type is a frontend layer — the prompt the agent receives now
    // carries the requested depth before the actual user text.
    const effectivePrompt = directive ? `${directive}\n\n${trimmed}` : trimmed;
    const prompt = buildHistoryPrompt(history, effectivePrompt);

    const abort = new AbortController();
    abortRef.current = abort;

    const patchAssistant = (patch: string) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, content: `${last.content}${patch}` };
        return next;
      });
    };

    try {
      const speakOutput = await storage.getString(SPEAK_OUTPUT_KEY);
      const model = await getSelectedZenModel();
      const reply = await chatStream(
        {
          system: OSAMAH_SYSTEM,
          user: prompt,
          chain: model ? [model] : undefined,
          onDelta: (delta) => patchAssistant(delta),
        },
        abort.signal,
      );

      if (reply && chatIdRef.current) {
        await addMessage(db, parseInt(chatIdRef.current), { content: reply, role: Role.Bot });
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: reply };
          return next;
        });
        if (speakOutput === 'true' || speakOutput === '1') {
          Speech.stop();
          Speech.speak(reply.replace(/\s+/g, ' ').trim(), {
            language: 'ar-SA',
            rate: 1,
          });
        }
      } else {
        setMessages((prev) => prev.filter((m) => !(m.role === Role.Bot && m.content === '')));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      const message =
        err instanceof AgentUnavailableError
          ? t('chat.errorBody')
          : `${err?.message ?? err}`;
      Alert.alert(t('chat.errorTitle'), message);
      setMessages((prev) => prev.filter((m) => !(m.role === Role.Bot && m.content === '')));
    } finally {
      abortRef.current = null;
      setIsSending(false);
    }
  };

  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const isPdfBusyRef = useRef(false);
  const onSharePdf = async () => {
    if (isPdfBusyRef.current) return;
    const rows = messagesRef.current;
    if (rows.length === 0) return;
    isPdfBusyRef.current = true;
    setIsPdfBusy(true);
    try {
      const markdown = messagesToMarkdown(rows);
      const title = `${t('appName')} — ${new Date().toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}`;
      const uri = await saveMarkdownAsPdf(markdown, title);
      // Register the exported PDF in Saved Files (Tools) so the artifact is
      // kept in a persistent app directory, not lost in the OS cache.
      await addSavedFile(uri, `${title}.pdf`, 'pdf', { chatId: chatIdRef.current ? parseInt(chatIdRef.current) : undefined });
      await archiveToServer(title, markdown);
    } catch (err: any) {
      Alert.alert(t('chat.pdfErrorTitle'), `${t('chat.pdfErrorBody')}: ${err?.message ?? err}`);
    } finally {
      isPdfBusyRef.current = false;
      setIsPdfBusy(false);
    }
  };

  const bottomClearance = TAB_BAR_HEIGHT + bottom;

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Text style={{ color: colors.onBackground, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>
              {t('appName')}
            </Text>
          ),
          headerRight: () => (
            <Pressable
              onPress={onSharePdf}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginRight: 4 })}>
              {isPdfBusy ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <MaterialIcons name="picture-as-pdf" size={20} color={colors.onBackground} />
              )}
            </Pressable>
          ),
        }}
      />
      <View style={styles.pageInner} onLayout={onLayout}>
        {messages.length == 0 && (
          <View style={[styles.logoContainer, { marginTop: height / 2 - 100, borderColor: withAlpha(colors.outline, 0.3) }]}>
            <Image source={require('@/assets/images/logo-white.png')} style={styles.image} />
          </View>
        )}
        <FlatList
          data={messages}
          keyExtractor={(_, index) => String(index)}
          renderItem={({ item }) => <ChatMessage {...item} />}
          contentContainerStyle={{ paddingTop: 30, paddingBottom: bottomClearance + 110 }}
          keyboardDismissMode="on-drag"
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={70}
        style={{
          position: 'absolute',
          bottom: bottomClearance,
          left: 0,
          width: '100%',
        }}>
        {messages.length === 0 && <MessageIdeas onSelectCard={(text) => onShouldSend(text)} />}
        <MessageInput onShouldSend={onShouldSend} disabled={isSending} />
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  logoContainer: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
    backgroundColor: '#000',
    borderRadius: 50,
    borderWidth: 1,
  },
  image: {
    width: 30,
    height: 30,
    resizeMode: 'cover',
  },
  page: {
    flex: 1,
  },
  pageInner: {
    flex: 1,
  },
});
export default ChatPage;