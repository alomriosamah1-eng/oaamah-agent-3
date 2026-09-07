import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useIsFocused } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { VideoSource } from 'expo-video';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon, MagentaGlow, Sky, DeepViolet } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';
import { BrandNavTitle } from '@/components/BrandNavTitle';
import { ReelCard } from '@/components/flow/ReelCard';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';
import { fetchFeedPage, getFeedCache, type FlowVideo } from '@/utils/flow/youtubeClient';
import {
  resolveStream,
  streamFitsQuality,
  type ResolvedStream,
  type StreamQuality,
} from '@/utils/flow/streamResolver';
import {
  refreshFlowKeywords,
  shouldRefreshKeywords,
  loadFilterLists,
  passesFilter,
} from '@/utils/flow/keywords';
import { warmApiHub } from '@/utils/apiHub';
import { addFlowHistory, getSavedVideos, addLiked, removeLiked, getLikedIds, clearStreamCache, type SavedVideo } from '@/utils/flow/flowDB';
import { probeStream, markStreamGood } from '@/utils/flow/streamProbe';
import { downloadForOffline, deleteOffline } from '@/utils/flow/offline';
import { useOnline } from '@/utils/flow/net';
import { storage } from '@/utils/Storage';

const VISIBILITY_CONFIG = { itemVisiblePercentThreshold: 60 };
// Wait for the paged list to settle before creating a native player. During a
// fast fling the index changes rapidly; starting a player for every
// intermediate card would churn native players (jank + native crashes).
const PLAY_START_DELAY_MS = 180;
// Rotated on every feed load so each visit surfaces different content first.
const ROTATION_KEY = 'flowRotCursor';

export function FlowScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const isFocused = useIsFocused();

  const { online } = useOnline();

  const [items, setItems] = useState<FlowVideo[]>([]);
  const [feedVersion, setFeedVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [quality, setQuality] = useState<StreamQuality>('medium');
  const [booting, setBooting] = useState(true);
  const [filtering, setFiltering] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showingSaved, setShowingSaved] = useState(false);
  const [likedNow, setLikedNow] = useState<Set<string>>(new Set());
  const [activeSource, setActiveSource] = useState<VideoSource | null>(null);
  const [feedHeight, setFeedHeight] = useState(0);

  const pageTokenRef = useRef<string | undefined>(undefined);
  const lastSliceTokenRef = useRef<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const streamsRef = useRef<Record<string, ResolvedStream>>({});
  const savedByIdRef = useRef<Record<string, SavedVideo>>({});
  const savedSetRef = useRef<Set<string>>(new Set());
  const likedRef = useRef<Set<string>>(new Set());
  const lastViewedRef = useRef<string | null>(null);
  const allowKeywordsRef = useRef<string[]>([]);
  const avoidKeywordsRef = useRef<string[]>([]);
  const resolveTokenRef = useRef(0);

  const bottomInset = TAB_BAR_HEIGHT + (insets.bottom > 0 ? insets.bottom : 6) + 14;

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashNotice = (msg: string) => {
    setNotice(msg);
    if (noticeTimer.current != null) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2600);
  };

  /* ------------------------------------------------------------------ */
  /* Keywords                                                            */
  /* ------------------------------------------------------------------ */

  // Fast path: load whatever keyword lists are saved. NEVER waits on the LLM —
  // the feed starts immediately, then doRefreshKeywords re-tunes in background.
  const ensureKeywords = useCallback(async () => {
    try {
      const { allow, avoid } = await loadFilterLists(db);
      allowKeywordsRef.current = allow;
      avoidKeywordsRef.current = avoid;
    } catch {
      allowKeywordsRef.current = [];
      avoidKeywordsRef.current = [];
    }
  }, [db]);

  // Background LLM refresh, bounded by refreshFlowKeywords' own timeout.
  const doRefreshKeywords = useCallback(async () => {
    try {
      if (!(await shouldRefreshKeywords(db))) return;
      setFiltering(true);
      await refreshFlowKeywords(db);
      const { allow, avoid } = await loadFilterLists(db);
      allowKeywordsRef.current = allow;
      avoidKeywordsRef.current = avoid;
    } catch {
      // keep whatever lists are already saved
    } finally {
      setFiltering(false);
    }
  }, [db]);

  /* ------------------------------------------------------------------ */
  /* Feed loading                                                        */
  /* ------------------------------------------------------------------ */

  const buildQuery = useCallback(() => {
    const allow = allowKeywordsRef.current;
    if (allow.length > 0) return allow.slice(0, 3).join(' ');
    return lang === 'ar' ? 'تقنية' : 'technology';
  }, [lang]);

  const fetchFiltered = useCallback(
    async (query: string, pageToken?: string): Promise<{ items: FlowVideo[]; next: string | null }> => {
      const page = await fetchFeedPage(db, query, lang, pageToken);
      const allow = allowKeywordsRef.current;
      const avoid = avoidKeywordsRef.current;
      const fresh: FlowVideo[] = [];
      for (const v of page.items) {
        if (seenRef.current.has(v.ytId)) continue;
        if (!passesFilter(v.title, v.description, v.channel, allow, avoid)) continue;
        seenRef.current.add(v.ytId);
        fresh.push(v);
      }
      return { items: fresh, next: page.nextPageToken };
    },
    [db, lang]
  );

  const loadFirstPage = useCallback(async (silent = false) => {
    if (!silent) setBooting(true);
    setLoadError(false);
    // NOTE: seenRef is intentionally NOT reset here. Keeping it across visits
    // means already-watched videos are skipped, so each entry fetches fresh
    // results instead of replaying the same first page.
    try {
      const allow = allowKeywordsRef.current;
      const slices = [allow.slice(0, 3), allow.slice(3, 6), allow.slice(6, 9), allow.slice(9)].filter(
        (s) => s.length > 0
      );

      // Rotate which keyword slice is queried FIRST on every load (persisted,
      // so the order changes even across app restarts).
      let rotatedSlices = slices;
      if (slices.length > 1) {
        const cursor = (Number(await storage.getString(ROTATION_KEY)) || 0) + 1;
        await storage.set(ROTATION_KEY, String(cursor));
        const rot = cursor % slices.length;
        rotatedSlices = rot === 0 ? slices : [...slices.slice(rot), ...slices.slice(0, rot)];
      }

      let merged: FlowVideo[] = [];
      // Walk keyword slices until we gather a healthy first page.
      for (const slice of rotatedSlices) {
        if (merged.length >= 24) break;
        const { items, next } = await fetchFiltered(slice.join(' '));
        merged = merged.concat(items);
        lastSliceTokenRef.current = next;
      }
      if (rotatedSlices.length === 0) {
        const { items, next } = await fetchFiltered(buildQuery());
        merged = items;
        lastSliceTokenRef.current = next;
      }

      // No live content (quota exhausted / providers down / everything seen).
      // Fall back to the persisted feed cache so FLOW never shows a blank feed
      // when the network providers are unavailable.
      if (merged.length === 0) {
        const cached = await getFeedCache(db, lang, 60);
        const allow = allowKeywordsRef.current;
        const avoid = avoidKeywordsRef.current;
        for (const v of cached) {
          if (seenRef.current.has(v.ytId)) continue;
          if (!passesFilter(v.title, v.description, v.channel, allow, avoid)) continue;
          seenRef.current.add(v.ytId);
          merged.push(v);
        }
        lastSliceTokenRef.current = null;
      }

      pageTokenRef.current = lastSliceTokenRef.current ?? undefined;
      setItems(merged);
      setFeedVersion((v) => v + 1);
      setHasMore(lastSliceTokenRef.current != null && merged.length < 200);
      setActiveIndex(0);
    } catch {
      // Live fetch threw. Before declaring an error, try the persisted cache so
      // FLOW still renders content (network flaps, quota, provider deaths).
      try {
        const cached = await getFeedCache(db, lang, 60);
        const allow = allowKeywordsRef.current;
        const avoid = avoidKeywordsRef.current;
        const fromCache: FlowVideo[] = [];
        for (const v of cached) {
          if (seenRef.current.has(v.ytId)) continue;
          if (!passesFilter(v.title, v.description, v.channel, allow, avoid)) continue;
          seenRef.current.add(v.ytId);
          fromCache.push(v);
        }
        if (fromCache.length > 0) {
          setItems(fromCache);
          setFeedVersion((v) => v + 1);
          setHasMore(false);
          setActiveIndex(0);
          return;
        }
      } catch {
        // ignore cache errors
      }
      setLoadError(true);
    } finally {
      setBooting(false);
    }
  }, [fetchFiltered, buildQuery]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const query = allowKeywordsRef.current.length > 0 ? allowKeywordsRef.current.slice(0, 3).join(' ') : buildQuery();
      const { items: fresh, next } = await fetchFiltered(query, pageTokenRef.current);
      pageTokenRef.current = next ?? undefined;
      if (fresh.length > 0) setItems((prev) => [...prev, ...fresh]);
      setHasMore(next != null);
    } catch {
      // silent — next attempt will retry
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, fetchFiltered, buildQuery]);

  // Pull-to-refresh (only reachable at the top card, i.e. offset 0): re-tune
  // keywords in the background and load a fresh ROTATED page without blanking
  // the feed or restarting playback mid-list.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (online) doRefreshKeywords();
      await loadFirstPage(true);
    } finally {
      setRefreshing(false);
    }
  }, [online, doRefreshKeywords, loadFirstPage]);

  /* ------------------------------------------------------------------ */
  /* Saved library                                                       */
  /* ------------------------------------------------------------------ */

  const loadSaved = useCallback(async () => {
    const saved = await getSavedVideos(db);
    savedByIdRef.current = Object.fromEntries(saved.map((s) => [s.ytId, s]));
    savedSetRef.current = new Set(saved.map((s) => s.ytId));
    return saved;
  }, [db]);

  /* ------------------------------------------------------------------ */
  /* Startup / connectivity switching                                    */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    (async () => {
      // API HUB: refresh instance/key registry on schedule (never blocks the feed).
      warmApiHub().catch(() => {});
      await ensureKeywords();
      let likedList: string[] = [];
      try {
        likedList = await getLikedIds(db);
      } catch {
        likedList = [];
      }
      likedRef.current = new Set(likedList);
      setLikedNow(new Set(likedList));
      if (online) {
        doRefreshKeywords();
        await loadFirstPage();
      } else {
        const saved = await loadSaved();
        const mapped: FlowVideo[] = saved.map((s) => ({
          ytId: s.ytId,
          title: s.title,
          channel: s.channel,
          channelId: '',
          thumb: s.thumb,
          duration: 0,
          description: '',
          publishedAt: s.addedAt,
          lang,
        }));
        setItems(mapped);
        setHasMore(false);
        setActiveIndex(0);
        setBooting(false);
        setFeedVersion((v) => v + 1);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (!online) {
        const saved = await loadSaved();
        const mapped: FlowVideo[] = saved.map((s) => ({
          ytId: s.ytId,
          title: s.title,
          channel: s.channel,
          channelId: '',
          thumb: s.thumb,
          duration: 0,
          description: '',
          publishedAt: s.addedAt,
          lang,
        }));
        setItems(mapped);
        setHasMore(false);
        setActiveIndex(0);
        setBooting(false);
        setFeedVersion((v) => v + 1);
      } else if (hasMore && items.length === 0) {
        await ensureKeywords();
        doRefreshKeywords();
        await loadFirstPage();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  /* ------------------------------------------------------------------ */
  /* Active reel resolution (inline, one player per active card)         */
  /* ------------------------------------------------------------------ */

  // Resolves and VERIFIES a playable source for ONE card, then hands it to
  // that card's in-place FlowVideoUnit. The URL is probed first so the native
  // player only ever receives real media (HTML error pages / JSON challenges
  // are the top cause of Android hard crashes right after play). If the URL is
  // garbage, its cache entry is cleared and the resolver is re-run once so a
  // different provider is picked. Only the active card mounts a player — one
  // native player at any time, and playback starts only once the list settles.
  const resolveActive = useCallback(
    async (idx: number) => {
      const item = idx < 0 || idx >= items.length ? null : items[idx];
      if (!item) {
        setActiveSource(null);
        return;
      }

      const token = ++resolveTokenRef.current;
      const setSource = (src: VideoSource | null) => {
        if (token === resolveTokenRef.current) setActiveSource(src);
      };

      // Locally saved file — always safe, skip probing.
      const saved = savedByIdRef.current[item.ytId];
      if (saved) {
        markStreamGood(saved.localUri);
        setSource({ uri: saved.localUri, contentType: 'progressive' });
        return;
      }

      // Cached resolution: verify it still leads to real media.
      const cached = streamsRef.current[item.ytId];
      if (streamFitsQuality(cached, quality)) {
        if (await probeStream(cached!.url)) {
          if (token !== resolveTokenRef.current) return;
          markStreamGood(cached!.url);
          setSource({ uri: cached!.url, contentType: cached!.contentType });
          return;
        }
        // Bad cached URL — drop from memory + DB so the re-resolve changes provider.
        const without = { ...streamsRef.current };
        delete without[item.ytId];
        streamsRef.current = without;
        await clearStreamCache(db, item.ytId);
      }

      let stream = await resolveStream(db, item.ytId, quality);
      let ok = stream?.url ? await probeStream(stream.url) : false;
      if (!ok && stream?.url) {
        if (token !== resolveTokenRef.current) return;
        // Bad URL — clear cache so the retry is forced to a different provider.
        await clearStreamCache(db, item.ytId);
        stream = await resolveStream(db, item.ytId, quality);
        ok = stream?.url ? await probeStream(stream.url) : false;
        if (!ok && stream?.url) await clearStreamCache(db, item.ytId);
      }

      if (token !== resolveTokenRef.current) return; // stale — user already scrolled away
      if (!ok || !stream?.url) {
        setSource(null);
        flashNotice(t('flow.playbackError'));
        return;
      }
      streamsRef.current = { ...streamsRef.current, [item.ytId]: stream };
      setSource({ uri: stream.url, contentType: stream.contentType });
    },
    [items.length, quality, db, t]
  );

  useEffect(() => {
    if (items.length === 0) return;
    // The tab lost focus (user left FLOW): stop immediately and abandon any
    // in-flight resolution so playback never lingers in the background.
    if (!isFocused) {
      resolveTokenRef.current += 1;
      setActiveSource(null);
      return;
    }
    // Stop the previous card immediately (audio cuts out), then wait for the
    // paged list to settle before starting native playback for the new card.
    setActiveSource(null);
    const idx = activeIndex;
    const timer = setTimeout(() => resolveActive(idx), PLAY_START_DELAY_MS);

    const id = items[idx]?.ytId;
    if (id && lastViewedRef.current !== id) {
      lastViewedRef.current = id;
      addFlowHistory(db, id, 'viewed', allowKeywordsRef.current[0] ?? '').catch(() => {});
    }

    // Pre-resolve (and probe) the next card while this one plays — the probe
    // keeps bad URLs out of the in-memory cache used on the next scroll.
    const next = items[idx + 1];
    if (next && !savedByIdRef.current[next.ytId] && !streamFitsQuality(streamsRef.current[next.ytId], quality)) {
      resolveStream(db, next.ytId, quality).then(async (stream) => {
        if (!stream?.url) return;
        if (await probeStream(stream.url)) {
          streamsRef.current = { ...streamsRef.current, [next.ytId]: stream };
        } else {
          await clearStreamCache(db, next.ytId);
        }
      });
    }

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, quality, items.length, feedVersion, isFocused]);

  /* ------------------------------------------------------------------ */
  /* Interactions                                                        */
  /* ------------------------------------------------------------------ */

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first && typeof first.index === 'number') setActiveIndex(first.index);
  }).current;

  const toggleSaved = useCallback(
    async (item: FlowVideo) => {
      if (savedSetRef.current.has(item.ytId)) {
        await deleteOffline(db, item.ytId);
        const nextSet = new Set(savedSetRef.current);
        nextSet.delete(item.ytId);
        savedSetRef.current = nextSet;
        const idMap = { ...savedByIdRef.current };
        delete idMap[item.ytId];
        savedByIdRef.current = idMap;
        if (!online) {
          setItems((prev) => prev.filter((v) => v.ytId !== item.ytId));
          setActiveIndex(Math.max(0, activeIndex - 1));
        } else {
          flashNotice(t('flow.savedFailed'));
        }
        return;
      }

      setSavingId(item.ytId);
      let stream: ResolvedStream | undefined = streamsRef.current[item.ytId];
      if (!stream) {
        stream = (await resolveStream(db, item.ytId, quality)) ?? undefined;
        if (stream) streamsRef.current = { ...streamsRef.current, [item.ytId]: stream };
      }
      if (!stream) {
        setSavingId(null);
        flashNotice(t('flow.savedFailed'));
        return;
      }
      const saved = await downloadForOffline(db, item, stream, quality);
      setSavingId(null);
      if (saved) {
        savedSetRef.current = new Set(savedSetRef.current).add(item.ytId);
        savedByIdRef.current = { ...savedByIdRef.current, [item.ytId]: saved };
        flashNotice(t('flow.savedDone'));
        addFlowHistory(db, item.ytId, 'saved', allowKeywordsRef.current[0] ?? '').catch(() => {});
      } else {
        flashNotice(t('flow.savedFailed'));
      }
    },
    [db, quality, online, activeIndex, t]
  );

  const toggleLiked = useCallback(
    async (item: FlowVideo) => {
      if (likedRef.current.has(item.ytId)) {
        likedRef.current.delete(item.ytId);
        await removeLiked(db, item.ytId).catch(() => {});
      } else {
        likedRef.current.add(item.ytId);
        addLiked(db, item.ytId).catch(() => {});
        addFlowHistory(db, item.ytId, 'liked', allowKeywordsRef.current[0] ?? '').catch(() => {});
      }
      setLikedNow(new Set(likedRef.current));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db]
  );

  const toggleOrientation = useCallback(async () => {
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsLandscape(false);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        setIsLandscape(true);
      }
    } catch {
      // lock failed — ignore
    }
  }, [isLandscape]);

  useEffect(() => {
    return () => {
      resolveTokenRef.current += 1; // abandon any pending stream resolves
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  const onFeedLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0 && h !== feedHeight) setFeedHeight(h);
  };

  const headerTop = (insets.top > 0 ? insets.top : 10) + 4;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header (in normal flow, above the feed) */}
      <View style={{ paddingTop: headerTop, paddingBottom: 8 }}>
        <View style={styles.headerRow}>
          <BrandNavTitle suffix="FLOW" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable hitSlop={6} onPress={() => setShowingSaved((v) => !v)} style={styles.topBtn}>
              <MaterialIcons name="download-for-offline" size={20} color={CyanNeon} />
            </Pressable>
            <Pressable hitSlop={6} onPress={() => toggleOrientation()} style={styles.topBtn}>
              <MaterialIcons name={isLandscape ? 'portrait' : 'landscape'} size={20} color={CyanNeon} />
            </Pressable>
          </View>
        </View>
        {!online && (
          <View style={styles.offlineBanner}>
            <MaterialIcons name="wifi-off" size={14} color="#FFFFFF" />
            <Text style={styles.offlineText}>{t('flow.offlineBanner')}</Text>
          </View>
        )}
      </View>

      {showingSaved && (
        <View style={[styles.savedPanel, { bottom: bottomInset }]}>
          <Text style={[styles.savedTitle, { color: colors.onBackground }]}>{t('flow.savedTitle')}</Text>
          <SavedList
            onPick={async (saved) => {
              setShowingSaved(false);
              const current = await getSavedVideos(db);
              const map = Object.fromEntries(current.map((s) => [s.ytId, s]));
              savedByIdRef.current = map;
              savedSetRef.current = new Set(current.map((s) => s.ytId));

              // Jump to the saved item if it is already in the feed; otherwise
              // prepend it so it becomes the inline active card.
              const index = items.findIndex((v) => v.ytId === saved.ytId);
              if (index >= 0) {
                setActiveIndex(index);
              } else {
                const item: FlowVideo = {
                  ytId: saved.ytId,
                  title: saved.title,
                  channel: saved.channel,
                  channelId: '',
                  thumb: saved.thumb,
                  duration: 0,
                  description: '',
                  publishedAt: saved.addedAt,
                  lang,
                };
                savedByIdRef.current = { ...savedByIdRef.current, [saved.ytId]: saved };
                setItems((prev) => [{ ...item }, ...prev]);
                setActiveIndex(0);
              }
            }}
            onDelete={async (saved) => {
              await deleteOffline(db, saved.ytId);
              await loadSaved();
            }}
          />
        </View>
      )}

      {booting || filtering ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={CyanNeon} size="large" />
          <Text style={styles.stateText}>{filtering ? t('flow.tuning') : t('flow.booting')}</Text>
        </View>
      ) : loadError ? (
        <View style={styles.centerState}>
          <MaterialIcons name="error-outline" size={40} color={MagentaGlow} />
          <Text style={styles.stateText}>{t('flow.error')}</Text>
          <Pressable onPress={() => { doRefreshKeywords(); loadFirstPage(); }} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('flow.retry')}</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centerState}>
          <MaterialIcons name="slideshow" size={44} color={DeepViolet} />
          <Text style={styles.stateText}>{t('flow.empty')}</Text>
          <Text style={styles.emptyHint}>{t('flow.emptyHint')}</Text>
          <Pressable onPress={() => { doRefreshKeywords(); loadFirstPage(); }} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('flow.tune')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.feed} onLayout={onFeedLayout}>
          {feedHeight > 0 ? (
            <>
              <FlatList
                data={items}
                keyExtractor={(v) => v.ytId}
                renderItem={({ item, index }) => (
                  <View style={{ height: feedHeight }}>
                    <ReelCard
                      video={item}
                      isActive={index === activeIndex}
                      activeSource={index === activeIndex ? activeSource : null}
                      quality={quality}
                      onQualityChange={(q) => setQuality(q)}
                      isSaved={savedSetRef.current.has(item.ytId)}
                      isLiked={likedNow.has(item.ytId)}
                      matchedKeyword={allowKeywordsRef.current[0] ?? ''}
                      onToggleSaved={() => toggleSaved(item)}
                      onToggleLiked={() => toggleLiked(item)}
                      bottomInset={bottomInset}
                    />
                    {savingId === item.ytId && (
                      <View style={styles.savingBadge}>
                        <ActivityIndicator size="small" color={Sky} />
                        <Text style={{ color: '#FFFFFF', fontSize: 12 }}>{t('flow.saving')}</Text>
                      </View>
                    )}
                  </View>
                )}
                pagingEnabled
                decelerationRate="fast"
                showsVerticalScrollIndicator={false}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={VISIBILITY_CONFIG}
                initialNumToRender={1}
                maxToRenderPerBatch={1}
                windowSize={3}
                removeClippedSubviews
                onEndReachedThreshold={0.4}
                onEndReached={online ? loadMore : undefined}
                getItemLayout={(_, index) => ({ length: feedHeight, offset: feedHeight * index, index })}
                ListFooterComponent={
                  !hasMore && items.length > 0 ? (
                    <View style={{ height: feedHeight, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
                      <Text style={{ color: colors.onSurfaceVariant, fontSize: 13, textAlign: 'center' }}>
                        {t('flow.endOfFeed')}
                      </Text>
                    </View>
                  ) : undefined
                }
              />
              {loadingMore && (
                <View style={{ position: 'absolute', bottom: bottomInset + 8, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator color={CyanNeon} size="small" />
                  <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>{t('flow.loadingMore')}</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.centerState}>
              <ActivityIndicator color={CyanNeon} size="small" />
            </View>
          )}
        </View>
      )}

      {notice && (
        <View style={[styles.notice, { bottom: bottomInset + 10 }]}>
          <MaterialIcons name="check-circle" size={16} color={Sky} />
          <Text style={{ color: '#FFFFFF', fontSize: 13 }}>{notice}</Text>
        </View>
      )}
    </View>
  );
}

function SavedList({
  onPick,
  onDelete,
}: {
  onPick: (s: SavedVideo) => void;
  onDelete: (s: SavedVideo) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const db = useSQLiteContext();
  const [saved, setSaved] = useState<SavedVideo[]>([]);

  useEffect(() => {
    getSavedVideos(db).then(setSaved);
  }, [db]);

  if (saved.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
        <Text style={[typography.bodySmall as any, { color: colors.onSurfaceVariant, textAlign: 'center' }]}>
          {t('flow.noSaved')}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={saved}
      keyExtractor={(s) => s.ytId}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: withAlpha(colors.outline, 0.2),
            backgroundColor: withAlpha(colors.surfaceVariant, 0.4),
            marginBottom: 8,
          }}>
          <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => onPick(item)}>
            <View style={styles.savedIcon}>
              <MaterialIcons name="play-arrow" size={24} color={Sky} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onSurface, fontSize: 13, fontWeight: FontWeights.semiBold as any }} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={{ color: colors.onSurfaceVariant, fontSize: 11 }} numberOfLines={1}>
                {item.channel} · {Math.round((item.size || 0) / 1024)} KB
              </Text>
            </View>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => onDelete(item)}>
            <MaterialIcons name="delete-outline" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  topBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: withAlpha('#0A0E17', 0.7),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: withAlpha(CyanNeon, 0.25),
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: withAlpha(MagentaGlow, 0.25),
    borderColor: withAlpha(MagentaGlow, 0.5),
    borderWidth: 1,
    borderRadius: 99,
    paddingVertical: 6,
    marginHorizontal: 60,
    marginTop: 8,
  },
  offlineText: { color: '#FFFFFF', fontSize: 12, fontWeight: FontWeights.semiBold as any },
  feed: { flex: 1, overflow: 'hidden' },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  stateText: {
    color: '#E5E7EB',
    ...(typography.bodyMedium as any),
    textAlign: 'center',
  },
  emptyHint: {
    color: '#9CA3AF',
    ...(typography.bodySmall as any),
    marginTop: 2,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: withAlpha(CyanNeon, 0.4),
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: withAlpha(CyanNeon, 0.1),
  },
  retryText: { color: CyanNeon, fontWeight: FontWeights.bold as any },
  savingBadge: {
    position: 'absolute',
    alignSelf: 'center',
    top: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: withAlpha('#0A0E17', 0.75),
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  notice: {
    position: 'absolute',
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: withAlpha('#0A0E17', 0.85),
    borderRadius: 16,
    paddingVertical: 10,
    zIndex: 40,
  },
  savedPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 72,
    borderRadius: 20,
    padding: 14,
    backgroundColor: withAlpha('#0A0E17', 0.94),
    borderWidth: 1,
    borderColor: withAlpha(CyanNeon, 0.2),
    zIndex: 30,
  },
  savedTitle: {
    ...(typography.titleMedium as any),
    fontWeight: FontWeights.bold as any,
    marginBottom: 10,
  },
  savedIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: withAlpha(Sky, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
  },
});