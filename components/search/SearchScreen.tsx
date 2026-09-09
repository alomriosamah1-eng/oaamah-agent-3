// In-app universal search. The home screen's search bar now opens this screen
// instead of a chat: it deep-searches everything stored on-device (chat
// histories, second-brain prompt sessions, prompt-maker history, FLOW cached /
// liked / saved reels) with tappable result cards. The special button at the
// end of the search bar toggles «FLOW online» — an internet search through the
// OSAMAH FLOW system whose video cards open the picked reel in FLOW.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon, MagentaGlow, DeepViolet, Sky, EmeraldGlow } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';
import { searchLocalContent, type SearchHit } from '@/utils/search/searchLocal';
import { searchShorts, type FlowVideo } from '@/utils/flow/youtubeClient';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { addActivity } from '@/utils/activityLog';
import { useOnline } from '@/utils/flow/net';

type Mode = 'web' | 'flow';

function fmtDuration(sec: number): string {
  const s = sec || 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** Single tappable result card — chat, deep video or prompt. */
function HitCard({ hit, onPress, accent }: { hit: SearchHit; onPress: () => void; accent: string }) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const icon = hit.type === 'chat' ? 'chat' : hit.type === 'video' ? 'play-circle' : 'psychology-alt';
  const badge = hit.badge === 'saved' ? t('search.saved') : hit.badge === 'liked' ? t('search.liked') : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.hitCard,
        { borderColor: withAlpha(accent, 0.3), backgroundColor: withAlpha(colors.surfaceVariant, 0.42) },
        pressed && { opacity: 0.72 },
      ]}>
      {hit.thumb ? (
        <Image source={{ uri: hit.thumb }} style={[styles.thumb, { borderColor: withAlpha(accent, 0.3) }]} />
      ) : (
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(accent, 0.16) }]}>
          <MaterialIcons name={icon} size={22} color={accent} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold, flex: 1 }} numberOfLines={1}>
            {hit.title}
          </Text>
          {badge && (
            <View style={[styles.badge, { backgroundColor: withAlpha(accent, 0.18) }]}>
              <Text style={{ color: accent, fontSize: 10 }}>{badge}</Text>
            </View>
          )}
        </View>
        {hit.preview ? (
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }} numberOfLines={2}>
            {hit.preview}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
          {hit.type === 'video' && hit.duration ? (
            <>
              <MaterialIcons name="schedule" size={12} color={colors.onSurfaceVariant} />
              <Text style={{ color: colors.onSurfaceVariant, fontSize: 11 }}>{fmtDuration(hit.duration)}</Text>
              <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: colors.onSurfaceVariant, marginHorizontal: 3 }} />
            </>
          ) : null}
          <Text style={{ color: colors.onSurfaceVariant, fontSize: 11 }} numberOfLines={1}>
            {hit.channel || hit.preview}
          </Text>
        </View>
      </View>
      <MaterialIcons name="chevron-left" size={22} color={colors.onSurfaceVariant} />
    </Pressable>
  );
}

/** FLOW reel returned by the online search — rendered as a video card. */
function FlowCard({ video, onPress }: { video: FlowVideo; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.hitCard,
        { borderColor: withAlpha(CyanNeon, 0.32), backgroundColor: withAlpha(colors.surfaceVariant, 0.42) },
        pressed && { opacity: 0.72 },
      ]}>
      <Image source={{ uri: video.thumb }} style={[styles.thumb, { borderColor: withAlpha(CyanNeon, 0.3) }]} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }} numberOfLines={1}>
          {video.title}
        </Text>
        <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }} numberOfLines={1}>
          {video.channel}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <View style={[styles.badge, { backgroundColor: withAlpha(CyanNeon, 0.16) }]}>
            <MaterialIcons name="wifi" size={11} color={CyanNeon} />
            <Text style={{ color: CyanNeon, fontSize: 10 }}>FLOW</Text>
          </View>
          {video.duration ? (
            <Text style={{ color: colors.onSurfaceVariant, fontSize: 11 }}>{fmtDuration(video.duration)}</Text>
          ) : null}
        </View>
      </View>
      <MaterialIcons name="chevron-left" size={22} color={colors.onSurfaceVariant} />
    </Pressable>
  );
}

export function SearchScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useSQLiteContext();

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('web');
  const { online } = useOnline();
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [reels, setReels] = useState<FlowVideo[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const topSafeArea = insets.top > 0 ? insets.top + 4 : 10;

  const runLocal = useCallback(
    async (q: string) => {
      setSearching(true);
      setError(false);
      try {
        const results = await searchLocalContent(db, q);
        setHits(results);
        void addActivity({ source: 'search', title: q, detail: t('search.local'), });
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    },
    [db, t]
  );

  const runOnline = useCallback(
    async (q: string) => {
      setSearching(true);
      setError(false);
      try {
        const page = await searchShorts(q, lang);
        setReels(page.items);
        void addActivity({ source: 'search', title: q, detail: t('search.flowOnline') });
        if (page.items.length === 0) setError(true);
      } catch {
        setReels([]);
        setError(true);
      } finally {
        setSearching(false);
      }
    },
    [lang, t]
  );

  const toggleMode = () => {
    const next: Mode = mode === 'web' ? 'flow' : 'web';
    setMode(next);
    if (next === 'web' && query.trim()) void addActivity({ source: 'search', title: query.trim(), detail: t('search.googleBrowser') });
    if (query.trim()) {
      if (next === 'flow') runOnline(query.trim());
      else if (online) setSearching(false);
      else runLocal(query.trim());
    }
  };

  useEffect(() => {
    const q = query.trim();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q) {
      setHits([]);
      setReels([]);
      setSearching(false);
      setError(false);
      return;
    }
    if (mode === 'web' && online) {
      setSearching(false);
      setError(false);
      return;
    }
    setSearching(true);
    timerRef.current = setTimeout(() => {
      if (mode === 'flow') runOnline(q);
      else runLocal(q);
    }, 280);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode, online]);

  const openVideo = (v: { ytId: string; title: string; channel?: string; thumb?: string; duration?: number }) => {
    router.push({
      pathname: '/flow',
      params: {
        open: v.ytId,
        openTitle: encodeURIComponent(v.title || ''),
        openChannel: encodeURIComponent(v.channel || ''),
        openThumb: encodeURIComponent(v.thumb || ''),
        openDuration: String(v.duration || 0),
      },
    });
  };

  const openChat = (id?: number) => {
    if (id) router.push(`/chat/${id}`);
  };

  const chats = hits.filter((h) => h.type === 'chat');
  const videos = hits.filter((h) => h.type === 'video');
  const prompts = hits.filter((h) => h.type === 'prompt');
  const hasLocalResults = hits.length > 0;
  const empty = query.trim().length === 0;
  const usingLocalFallback = mode === 'web' && !online;
  const noResults = !empty && !searching && !error && (usingLocalFallback ? !hasLocalResults : mode === 'flow' ? reels.length === 0 : false);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topSafeArea }]}>
      {/* Drag-down handle + exit button (swipe down or X to leave search) */}
      <View style={styles.header}>
        <View style={[styles.grabber, { backgroundColor: withAlpha(colors.onSurfaceVariant, 0.35) }]} />
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('search.close')}
          hitSlop={10}
          style={({ pressed }) => [
            styles.closeBtn,
            { backgroundColor: withAlpha(colors.surfaceVariant, 0.6) },
            pressed && { opacity: 0.6 },
          ]}>
          <Ionicons name="close" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      {/* Search bar + FLOW online toggle at the end of the bar */}
      <View style={styles.searchRow}>
        <View style={[styles.inputShell, { backgroundColor: colors.surface, borderColor: withAlpha(mode === 'flow' ? CyanNeon : Sky, 0.4) }]}>
          <MaterialIcons name="search" size={20} color={CyanNeon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.inputHint')}
            placeholderTextColor={withAlpha(colors.onSurfaceVariant, 0.6)}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={[styles.input, { color: colors.onSurface }]}
          />
          {searching ? <ActivityIndicator size="small" color={CyanNeon} /> : null}
        </View>
        <Pressable
          onPress={toggleMode}
          accessibilityRole="button"
          accessibilityLabel={t('search.flowOnline')}
          style={({ pressed }) => [
            styles.flowBtn,
            {
              borderColor: withAlpha(mode === 'flow' ? CyanNeon : Sky, 0.4),
              backgroundColor: mode === 'flow' ? withAlpha(CyanNeon, 0.14) : withAlpha(Sky, 0.12),
            },
            pressed && { opacity: 0.75 },
          ]}>
          <MaterialIcons name={mode === 'flow' ? 'play-circle' : 'language'} size={18} color={mode === 'flow' ? CyanNeon : Sky} />
          <Text style={{ color: mode === 'flow' ? CyanNeon : Sky, fontSize: 11, fontWeight: FontWeights.bold }}>
            {mode === 'flow' ? 'FLOW' : 'WEB'}
          </Text>
        </Pressable>
      </View>

      {/* Mode hint */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingBottom: 8 }}>
        <View style={[styles.dot, { backgroundColor: mode === 'flow' ? CyanNeon : Sky }]} />
        <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>
          {mode === 'flow' ? t('search.flowOnline') : online ? t('search.googleBrowser') : t('search.offlineLocal')}
        </Text>
      </View>

      {error ? (
        <View style={styles.centerState}>
          <MaterialIcons name="cloud-off" size={36} color={MagentaGlow} />
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodyMedium as any), textAlign: 'center' }}>
            {t('search.error')}
          </Text>
        </View>
      ) : empty ? (
        <View style={styles.centerState}>
          <MaterialIcons name="manage-search" size={40} color={CyanNeon} />
          <Text style={{ color: colors.onSurface, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>
            {t('search.emptyTitle')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any), textAlign: 'center', paddingHorizontal: 28 }}>
            {t('search.emptyHint')}
          </Text>
        </View>
      ) : searching ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={CyanNeon} />
          <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>{t('search.searching')}</Text>
        </View>
      ) : noResults ? (
        <View style={styles.centerState}>
          <MaterialIcons name="search-off" size={36} color={colors.onSurfaceVariant} />
          <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
            {t('search.noResultsTitle')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any), textAlign: 'center', paddingHorizontal: 28 }}>
            {t('search.noResultsHint')}
          </Text>
        </View>
      ) : mode === 'web' && online ? (
        <View style={styles.browserWrap}>
          <View style={styles.browserBar}>
            <MaterialIcons name="language" size={16} color={Sky} />
            <Text style={{ color: colors.onSurfaceVariant, fontSize: 12, flex: 1 }} numberOfLines={1}>{t('search.googleResults')}</Text>
            <MaterialIcons name="open-in-new" size={16} color={colors.onSurfaceVariant} />
          </View>
          <WebView source={{ uri: `https://www.google.com/search?igu=1&q=${encodeURIComponent(query.trim())}` }} style={styles.browser} startInLoadingState javaScriptEnabled domStorageEnabled allowsBackForwardNavigationGestures setSupportMultipleWindows={false} />
        </View>
      ) : (
        <FlatList
          data={mode === 'flow' ? (['flow'] as const) : (['chats', 'videos', 'prompts'] as const)}
          keyExtractor={(k) => k}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => {
            if (mode === 'flow') {
              return (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: colors.onBackground, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>
                    {t('search.flowOnline')}
                  </Text>
                  {reels.map((v) => (
                    <FlowCard key={v.ytId} video={v} onPress={() => openVideo(v)} />
                  ))}
                </View>
              );
            }
            const list = item === 'chats' ? chats : item === 'videos' ? videos : prompts;
            if (list.length === 0) return null;
            return (
              <View style={{ gap: 8, marginBottom: 14 }}>
                <Text style={{ color: colors.onBackground, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>
                  {item === 'chats' ? t('search.chatsSection') : item === 'videos' ? t('search.videosSection') : t('search.promptsSection')}
                </Text>
                {list.map((hit, i) => {
                  const accent =
                    hit.type === 'chat' ? Sky : hit.type === 'video' ? CyanNeon : MagentaGlow;
                  return (
                    <HitCard
                      key={`${hit.type}-${hit.id ?? hit.ytId ?? i}`}
                      hit={hit}
                      accent={accent}
                      onPress={() => {
                        if (hit.type === 'video') {
                          if (hit.ytId) {
                            openVideo({ ytId: hit.ytId, title: hit.title, channel: hit.channel, thumb: hit.thumb, duration: hit.duration });
                          }
                        } else if (hit.type === 'chat') {
                          openChat(hit.id);
                        } else {
                          router.push('/promptMaker');
                        }
                      }}
                    />
                  );
                })}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    position: 'relative',
    paddingTop: 6,
    paddingBottom: 4,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 6,
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  inputShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(31,41,55,0.5)',
  },
  input: {
    flex: 1,
    ...(typography.bodyMedium as any),
    fontSize: 14,
  },
  flowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 48,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  browserWrap: { flex: 1, marginHorizontal: 12, marginTop: 4, overflow: 'hidden', borderRadius: 16 },
  browserBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  browser: { flex: 1, minHeight: 420, backgroundColor: '#fff' },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 56,
    paddingHorizontal: 24,
  },
  hitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 78,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
});
