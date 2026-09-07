import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon, Red } from '@/theme/colors';
import { useI18n } from '@/i18n/provider';
import { storage } from '@/utils/Storage';
import { SeekSlider } from '@/components/flow/SeekSlider';
import type { StreamQuality } from '@/utils/flow/streamResolver';

export interface PlaybackSnapshot {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

interface FlowVideoUnitProps {
  source: VideoSource;
  quality: StreamQuality;
  onQualityChange: (q: StreamQuality) => void;
  onPlaybackChange?: (snapshot: PlaybackSnapshot) => void;
  /** Space (px) added above the bottom to stay clear of the floating tab bar. */
  bottomInset?: number;
}

const VOLUME_KEY = 'flowVolume';
const MUTED_KEY = 'flowMuted';
const CONTROLS_MS = 1400;

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Inline reel player — renders the video surface full-bleed inside the active
 * card. All chrome (play/pause, seek, volume, quality) is hidden by default and
 * only appears for a moment after the user taps the video. Tapping the middle
 * of the video toggles play/pause; the tap layer is a plain Pressable so feed
 * scrolling is never blocked and touches cannot crash the app. Auto-plays on
 * mount; the parent mounts exactly one unit at a time.
 */
export function FlowVideoUnit({ source, quality, onQualityChange, onPlaybackChange, bottomInset = 0 }: FlowVideoUnitProps) {
  const { t } = useI18n();

  const player = useVideoPlayer(source, (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.loop = true;
  });

  const appliedDefaults = useRef(false);
  const userPaused = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panel, setPanel] = useState<'none' | 'controls'>('none');
  const [flash, setFlash] = useState<'play' | 'pause' | null>(null);
  const [controlsOn, setControlsOn] = useState(false);
  const controlsOpacity = useRef(new Animated.Value(0)).current;
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // App settings: volume + mute, persisted in AsyncStorage.
  useEffect(() => {
    if (appliedDefaults.current) return;
    appliedDefaults.current = true;
    (async () => {
      const vol = Number((await storage.getString(VOLUME_KEY)) ?? '1');
      const muted = (await storage.getString(MUTED_KEY)) === '1';
      player.volume = Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 1;
      player.muted = muted;
    })();
  }, [player]);

  // Auto-play as soon as this (freshly mounted) unit exists.
  useEffect(() => {
    player.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: player.bufferedPosition,
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { volume } = useEvent(player, 'volumeChange', { volume: player.volume });
  const { muted } = useEvent(player, 'mutedChange', { muted: player.muted });

  const [duration, setDuration] = useState(0);
  useEffect(() => {
    if (status === 'readyToPlay' && player.duration > 0) setDuration(player.duration);
  }, [status, player]);

  useEffect(() => {
    onPlaybackChange?.({ currentTime, duration, isPlaying });
  }, [currentTime, duration, isPlaying, onPlaybackChange]);

  const showControls = () => {
    setControlsOn(true);
    controlsOpacity.setValue(1);
    if (hideTimer.current != null) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setControlsOn(false);
        setPanel('none');
      });
    }, CONTROLS_MS);
  };

  useEffect(() => {
    return () => {
      if (hideTimer.current != null) clearTimeout(hideTimer.current);
      if (flashTimer.current != null) clearTimeout(flashTimer.current);
    };
  }, []);

  const togglePlay = () => {
    if (isPlaying) {
      userPaused.current = true;
      player.pause();
      showFlash('pause');
    } else {
      userPaused.current = false;
      player.play();
      showFlash('play');
    }
    showControls();
  };

  const showFlash = (type: 'play' | 'pause') => {
    setFlash(type);
    if (flashTimer.current != null) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 420);
  };

  const setVolume = (v: number) => {
    player.volume = v;
    if (v > 0 && player.muted) player.muted = false;
    storage.set(VOLUME_KEY, String(v));
    showControls();
  };

  const toggleMute = () => {
    const next = !player.muted;
    player.muted = next;
    storage.set(MUTED_KEY, next ? '1' : '0');
    showControls();
  };

  const seekTo = (ratio: number) => {
    if (duration <= 0) return;
    player.currentTime = ratio * duration;
    showControls(); // keep the chrome up while the user is scrubbing
  };

  const buffering = status === 'loading' || status === 'idle';

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Full-bleed video surface — cover fits vertical shorts edge-to-edge */}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />

      {/* Buffering indicator */}
      {buffering && isPlaying && (
        <View style={styles.center} pointerEvents="none">
          <View style={styles.spinnerCircle}>
            <MaterialIcons name="video-library" size={28} color={CyanNeon} />
          </View>
        </View>
      )}

      {/*
        Full-screen tap layer — a plain Pressable, NOT a native gesture handler.
        Dragging is claimed by the paging feed (Pressable cancels on move), so
        scrolling is never blocked, and a touch can never crash the app. Any tap
        not claimed by a child control (the chrome below uses box-none) toggles
        play/pause — pressing the pause button pauses ONLY, with no double-fire.
      */}
      <Pressable style={StyleSheet.absoluteFill} onPress={togglePlay} accessibilityLabel={t('flow.togglePlay')} />

      {/* Transient play / pause feedback */}
      {flash && (
        <View style={styles.center} pointerEvents="none">
          <View style={styles.flashCircle}>
            <MaterialIcons name={flash === 'play' ? 'play-arrow' : 'pause'} size={36} color="#FFFFFF" />
          </View>
        </View>
      )}

      {/* All chrome (hidden by default, fades in on tap, auto-hides later).
          box-none: only the buttons/sliders intercept touches; taps on empty
          chrome fall through to the tap layer above/below and toggle playback
          while it is visible. pointerEvents 'none' while hidden. */}
      <Animated.View
        style={[styles.chrome, { opacity: controlsOpacity }]}
        pointerEvents={controlsOn ? 'box-none' : 'none'}>
        {/* Always-visible (while chrome shown) play / pause toggle */}
        <Pressable hitSlop={14} onPress={togglePlay} style={styles.toggleBtn}>
          <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={30} color="#FFFFFF" />
        </Pressable>

        {/* Seek bar at the bottom */}
        <View style={[styles.seekWrap, { bottom: 18 + bottomInset }]}>
          <Text style={styles.seekTime}>{fmtTime(currentTime)}</Text>
          <SeekSlider value={duration > 0 ? currentTime / duration : 0} onSeek={seekTo} style={styles.seekBar} />
          <Text style={styles.seekTime}>{fmtTime(duration)}</Text>
        </View>

        {/* Volume + quality controls pill */}
        <View style={[styles.pill, { bottom: 40 + bottomInset }]}>
          <Pressable hitSlop={6} onPress={toggleMute} style={styles.pillBtn}>
            <MaterialIcons name={muted || volume === 0 ? 'volume-off' : 'volume-up'} size={18} color="#FFFFFF" />
          </Pressable>
          {panel === 'controls' && (
            <View style={styles.panel}>
              <View style={styles.panelRow}>
                <MaterialIcons name="volume-up" size={16} color={CyanNeon} />
                <SeekSlider value={muted ? 0 : volume} onSeek={setVolume} style={styles.panelSlider} color={CyanNeon} />
              </View>
              <Text style={styles.panelLabel}>{t('flow.volume')}</Text>
            </View>
          )}
          <Pressable
            hitSlop={6}
            onPress={() => {
              setPanel(panel === 'controls' ? 'none' : 'controls');
              showControls();
            }}
            style={styles.pillBtn}>
            <MaterialIcons name="settings" size={17} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Quality segment row */}
        {panel === 'controls' && (
          <View style={[styles.qualityRow, { bottom: 92 + bottomInset }]}>
            {(['low', 'medium', 'high'] as StreamQuality[]).map((q) => {
              const active = q === quality;
              return (
                <Pressable
                  key={q}
                  onPress={() => {
                    onQualityChange(q);
                    setPanel('none');
                    showControls();
                  }}
                  style={[styles.qChip, active && { backgroundColor: withAlpha(CyanNeon, 0.2), borderColor: CyanNeon }]}>
                  <Text style={[styles.qLabel, active && { color: CyanNeon }]}>{t(`flow.quality${q[0].toUpperCase() + q.slice(1)}` as any)}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Animated.View>

      {status === 'error' && (
        <View style={styles.center} pointerEvents="none">
          <Text style={{ color: Red, ...typography.bodySmall }}>{t('flow.playbackError')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  chrome: { ...StyleSheet.absoluteFillObject },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  flashCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: withAlpha('#000000', 0.5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: withAlpha('#000000', 0.45),
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtn: {
    position: 'absolute',
    top: '46%',
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withAlpha('#000000', 0.4),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  seekWrap: {
    position: 'absolute',
    left: 12,
    right: 82,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 7,
  },
  seekBar: { flex: 1 },
  seekTime: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontFamily: 'SpaceMono', minWidth: 30, textAlign: 'center' },
  pill: {
    position: 'absolute',
    right: 14,
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 22,
    backgroundColor: withAlpha('#0A0E17', 0.6),
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: withAlpha('#FFFFFF', 0.15),
    zIndex: 9,
  },
  pillBtn: { padding: 6, borderRadius: 16 },
  panel: {
    minWidth: 150,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelSlider: { flex: 1, height: 24 },
  panelLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 2 },
  qualityRow: {
    position: 'absolute',
    right: 14,
    bottom: 92,
    flexDirection: 'row',
    gap: 6,
    borderRadius: 18,
    padding: 6,
    backgroundColor: withAlpha('#0A0E17', 0.6),
    borderWidth: 1,
    borderColor: withAlpha('#FFFFFF', 0.15),
    zIndex: 8,
  },
  qChip: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  qLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: FontWeights.medium as any },
});