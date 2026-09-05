// React binding of the VoiceEngine: wires the engine events up to React state
// and the orb's amplitude/band shared values, and provides the concrete
// player/audio implementation (expo-audio) the engine needs. The panel renders
// exclusively from what this hook exposes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioSampleListener,
  setAudioModeAsync,
} from 'expo-audio';
import { agentMessageStream, getSelectedZenModel } from '@/utils/OpenCodeAgent';
import { useVoiceLevels } from '@/utils/orbs/useVoiceLevels';
import { VoiceEngine, VoicePhase, VoiceEngineEvent } from './engine';
import { createVoiceRouter, describeRoute } from './providers/router';
import { deviceSttProvider, deviceSttAvailable, cloudSttProvider } from './stt';
import { DEFAULT_VOICE_CONFIG, loadVoiceConfig, saveVoiceConfig, VoiceConfig } from './config';
import { voiceLog } from './log';

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
  /** True when running in Expo Go with no off-device recognizer and no
   *  gateway configured — the mic cannot transcribe until `voiceGatewayUrl`
   *  is set (or a dev/preview build is used). */
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
  const [sttNeedsGateway, setSttNeedsGateway] = useState(() => deviceSttAvailable === false);

  // Orb inputs.
  const micLevel = useVoiceLevels();
  const outputLevels = useVoiceLevels();
  const micBoost = useSharedValue(false);

  // Concrete expo-audio player + a live ref so never-stale status is readable
  // from async closures created once at engine construction.
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);
  const playerStatusRef = useRef(playerStatus);
  playerStatusRef.current = playerStatus;

  // Feed REAL decoded PCM into the orb output while speaking.
  useAudioSampleListener(player, (sample) => {
    const frames = sample?.channels?.[0]?.frames;
    if (frames && frames.length) outputLevels.setSamples(frames, 16_000);
  });

  /* --------------------------- engine creation -------------------------- */

  const engineRef = useRef<VoiceEngine | null>(null);

  const routeEngineEvent = useCallback(
    (event: VoiceEngineEvent) => {
      switch (event.type) {
        case 'phase':
          setPhase(event.phase);
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
        case 'error':
          setLastError(event.message);
          setDiag(event.message ? `error: ${event.message}` : '');
          break;
        case 'stt-volume':
          // Drive the orb with a live meter while listening.
          micBoost.value = event.level > 0.1;
          micLevel.setSamples([event.level]);
          break;
        default:
          break;
      }
    },
    [micBoost, micLevel],
  );

  if (!engineRef.current) {
    const play = (uri: string): Promise<void> =>
      new Promise((resolve) => {
        const deadline = Date.now() + 20_000;
        setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).finally(() => {
          try {
            player.replace({ uri });
            player.play();
          } catch {
            resolve();
            return;
          }
          let started = false;
          const poll = () => {
            const s = playerStatusRef.current;
            if (engineRef.current?.getPhase() !== 'speaking') {
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

    const engine = new VoiceEngine({
      config: () => configRef.current,
      continuous: () => continuousRef.current,
      providers: {
        // Expo Go cannot run the on-device recognizer (native module not
        // bundled there) — fall back to gateway STT, which records with
        // expo-audio and transcribes through the voice gateway.
        stt: deviceSttAvailable ? deviceSttProvider : cloudSttProvider,
        tts: createVoiceRouter(),
      },
      audio: {
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
      },
      agent: agentMessageStream,
      getModel: () => getSelectedZenModel(),
      onEvent: routeEngineEvent,
    });
    engineRef.current = engine;
  }

  /* --------------------------- lifecycle effects ------------------------ */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await loadVoiceConfig().catch(() => DEFAULT_VOICE_CONFIG);
      if (cancelled) return;
      configRef.current = cfg;
      setConfig(cfg);
      engineRef.current?.setVolume(cfg.volume);
      const line = await describeRoute(cfg.mode).catch(() => '');
      if (!cancelled) setProviderLine(line);
      // If we're on the gateway STT path, confirm a gateway is actually set.
      if (!cancelled && deviceSttAvailable === false) {
        const { isVoiceGatewayConfigured } = await import('./providers/gateway').catch(() => ({
          isVoiceGatewayConfigured: () => false,
        }));
        if (!isVoiceGatewayConfigured()) setSttNeedsGateway(true);
        else setSttNeedsGateway(false);
      }
    })();
    return () => {
      cancelled = true;
      engineRef.current?.stop();
      try {
        player.remove();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------- actions ------------------------------ */

  const start = useCallback(() => {
    setLastError('');
    setDiag('');
    void engineRef.current?.startListening();
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    micLevel.reset();
    outputLevels.reset();
    setDiag('');
  }, [micLevel, outputLevels]);

  const toggle = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    if (e.getPhase() === 'listening') {
      void e.finishListening();
      voiceLog('VOICE_START', 'finish-listening');
    } else if (e.getPhase() === 'idle') {
      setLastError('');
      void e.startListening();
    } else {
      e.stop();
    }
  }, []);

  const updateConfig = useCallback(
    async (patch: Partial<VoiceConfig>) => {
      const next = { ...configRef.current, ...patch };
      configRef.current = next;
      setConfig(next);
      engineRef.current?.setVolume(next.volume);
      try {
        await saveVoiceConfig(next);
        const line = await describeRoute(next.mode).catch(() => '');
        setProviderLine(line);
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