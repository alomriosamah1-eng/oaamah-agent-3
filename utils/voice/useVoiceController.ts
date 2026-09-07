// React binding of the conversation loop: wires its events up to React state,
// the orb's amplitude shared values, and the concrete expo-audio player the
// loop needs for speech output. The orb renders exclusively from here.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, useAudioSampleListener, setAudioModeAsync } from 'expo-audio';
import { agentMessageStream, getSelectedZenModel } from '@/utils/OpenCodeAgent';
import { useVoiceLevels } from '@/utils/orbs/useVoiceLevels';
import { useI18n } from '@/i18n/provider';
import { Conversation, VoicePhase, ConversationEvent } from './conversation';
import { createRecognizer, MIC_PERMISSION_BLOCKED, MIC_PERMISSION_DENIED } from './recognition';
import { speak, type SpeechAudio } from './speech';
import { DEFAULT_VOICE_CONFIG, loadVoiceConfig, saveVoiceConfig, VoiceConfig } from './config';

export interface Turn {
  role: 'user' | 'agent';
  text: string;
}

export interface UseVoiceControllerResult {
  phase: VoicePhase;
  turns: Turn[];
  partial: string;
  diag: string;
  /** Last error message (cleared on next interaction). */
  lastError: string;
  config: VoiceConfig;
  updateConfig: (patch: Partial<VoiceConfig>) => Promise<void>;
  providerLine: string;
  /** True when the gateway STT can't be reached — the mic cannot transcribe. */
  sttNeedsGateway: boolean;
  /** Orb inputs — pass straight to <VoiceOrb inputAmplitude/outputLevels>. */
  micLevel: ReturnType<typeof useVoiceLevels>;
  outputLevels: ReturnType<typeof useVoiceLevels>;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useVoiceController(): UseVoiceControllerResult {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partial, setPartial] = useState('');
  const [diag, setDiag] = useState('');
  const [lastError, setLastError] = useState('');
  const [config, setConfig] = useState<VoiceConfig>(DEFAULT_VOICE_CONFIG);
  const configRef = useRef<VoiceConfig>(config);
  configRef.current = config;

  const [continuous] = useState(true);
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;

  const [providerLine, setProviderLine] = useState('');
  const [sttNeedsGateway, setSttNeedsGateway] = useState(false);

  // Orb inputs.
  const micLevel = useVoiceLevels();
  const outputLevels = useVoiceLevels();

  // Concrete expo-audio player + a live ref so never-stale status is readable
  // from async closures created once at conversation construction.
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);
  const playerStatusRef = useRef(playerStatus);
  playerStatusRef.current = playerStatus;

  // Feed REAL decoded PCM into the orb output while speaking.
  useAudioSampleListener(player, (sample) => {
    const frames = sample?.channels?.[0]?.frames;
    if (frames && frames.length) outputLevels.setSamples(frames, 16_000);
  });

  /* -------------------------- conversation binding ----------------------- */

  const conversationRef = useRef<Conversation | null>(null);

  // `t` is captured here so the per-instance event callback (built once, when
  // the conversation is constructed) can look up strings without going stale.
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;

  const routeEvent = useCallback((event: ConversationEvent) => {
    switch (event.type) {
      case 'phase':
        setPhase(event.phase);
        if (event.phase === 'listening') setDiag('');
        break;
      case 'partial':
        setPartial(event.text);
        break;
      case 'diag':
        setDiag(event.text);
        break;
      case 'turn':
        setTurns((prev) => [...prev, { role: event.role, text: event.text }]);
        if (event.role === 'agent') setPartial('');
        break;
      case 'error': {
        const msg = event.message;
        setLastError(msg);
        setDiag(msg ? `error: ${msg}` : '');
        if (msg === MIC_PERMISSION_BLOCKED) {
          // "Never ask again" — the dialog can't re-open; the user must toggle
          // the permission in system settings.
          Alert.alert(
            tRef.current('voice.micBlockedTitle'),
            tRef.current('voice.micBlockedBody'),
            [
              { text: tRef.current('voice.cancel'), style: 'cancel' },
              { text: tRef.current('voice.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
            ],
          );
        } else if (msg === MIC_PERMISSION_DENIED) {
          Alert.alert(
            tRef.current('voice.micDeniedTitle'),
            tRef.current('voice.micDeniedBody'),
            [
              { text: tRef.current('voice.cancel'), style: 'cancel' },
              { text: tRef.current('voice.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
              { text: tRef.current('voice.micRetry'), onPress: () => conversationRef.current?.startListening() },
            ],
          );
        }
        break;
      }
      default:
        break;
    }
  }, []);

  if (!conversationRef.current) {
    const play = (uri: string): Promise<void> =>
      new Promise((resolve) => {
        const deadline = Date.now() + 20_000;
        setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).finally(() => {
          try {
            player.volume = configRef.current.volume;
            player.replace({ uri });
            player.play();
          } catch {
            resolve();
            return;
          }
          let started = false;
          const poll = () => {
            const s = playerStatusRef.current;
            if (conversationRef.current?.getPhase() !== 'speaking') {
              resolve();
              return;
            }
            if (!started) {
              if (s.playing || (s.didJustFinish && s.currentTime > 0)) started = true;
            } else if (s.didJustFinish) {
              resolve();
              return;
            }
            if (Date.now() > deadline) {
              resolve();
              return;
            }
            requestAnimationFrame(poll);
          };
          poll();
        });
      });

    const speechAudio: SpeechAudio = {
      play,
      setVolume: (v) => {
        try {
          player.volume = v;
        } catch {}
      },
      stop: () => {
        try {
          player.pause();
        } catch {}
      },
    };

    const conversation = new Conversation({
      config: () => configRef.current,
      continuous: () => continuousRef.current,
      // Desktop echo suppression: keep the mic muted 1.5s after speaking so
      // the reply doesn't echo back into a new turn.
      echoCooldownMs: 1500,
      recorder: createRecognizer(),
      agent: agentMessageStream,
      speak: (text, signal) => speak(text, configRef.current, speechAudio, { signal }),
      onEvent: routeEvent,
      getModel: () => getSelectedZenModel(),
    });
    conversationRef.current = conversation;
  }

  /* --------------------------- lifecycle effects ------------------------ */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await loadVoiceConfig().catch(() => DEFAULT_VOICE_CONFIG);
      if (cancelled) return;
      configRef.current = cfg;
      setConfig(cfg);
      const { gatewayStatus } = await import('./providers/gateway').catch(() => ({
        gatewayStatus: async () => false,
      }));
      if (cancelled) return;
      const reachable = await gatewayStatus().catch(() => false);
      setSttNeedsGateway(!reachable);
      setProviderLine(
        reachable
          ? 'edge-tts:on · google-stt:on · fallback:native'
          : 'edge-tts:off · google-stt:off · fallback:native',
      );
    })();
    return () => {
      cancelled = true;
      conversationRef.current?.stop();
      try {
        player.remove();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------- actions ------------------------------ */

  /** Begin the conversation loop (idle → listen). */
  const start = useCallback(() => {
    setLastError('');
    setDiag('');
    conversationRef.current?.startListening();
  }, []);

  /** End the whole conversation session (any active phase). */
  const stop = useCallback(() => {
    conversationRef.current?.stop();
    micLevel.reset();
    outputLevels.reset();
    setDiag('');
  }, [micLevel, outputLevels]);

  /**
   * The orb is the conversation's switch: idle → start, anything active →
   * stop. Utterances end by themselves through the VAD silence gate, so a
   * second press is never "finish talking" — it is a real stop.
   */
  const toggle = useCallback(() => {
    const c = conversationRef.current;
    if (!c) return;
    if (c.getPhase() === 'idle') {
      start();
    } else {
      stop();
    }
  }, [start, stop]);

  const updateConfig = useCallback(
    async (patch: Partial<VoiceConfig>) => {
      const next = { ...configRef.current, ...patch };
      configRef.current = next;
      setConfig(next);
      try {
        await saveVoiceConfig(next);
      } catch {}
    },
    [],
  );

  /* -------------------------------- value ------------------------------- */

  return useMemo<UseVoiceControllerResult>(
    () => ({
      phase,
      turns,
      partial,
      diag,
      lastError,
      config,
      updateConfig,
      providerLine,
      sttNeedsGateway,
      micLevel,
      outputLevels,
      start,
      stop,
      toggle,
    }),
    [phase, turns, partial, diag, lastError, config, updateConfig, providerLine, sttNeedsGateway, micLevel, outputLevels, start, stop, toggle],
  );
}