// React binding of the conversation loop: wires its events up to React state,
// the orb's amplitude shared values, and the concrete expo-audio player the
// loop needs for speech output. The orb renders exclusively from here.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, useAudioSampleListener, setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import { agentMessageStream, getSelectedZenModel } from '@/utils/OpenCodeAgent';
import { useVoiceLevels } from '@/utils/orbs/useVoiceLevels';
import { useI18n } from '@/i18n/provider';
import { Conversation, VoicePhase, ConversationEvent, type AgentStreamFn } from './conversation';
import { createRecognizer, MIC_PERMISSION_BLOCKED, MIC_PERMISSION_DENIED } from './recognition';
import { synthesizeSpeech, speakNativeSpeech } from './speech';
import { parseVoiceCommand } from './commands';
import { personaById } from './persona';
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

/**
 * The opening greeting is spoken exactly once per app launch — never again on
 * screen re-mounts or tab round-trips within the same session. It resets only
 * when the whole JS context restarts (i.e. the user relaunches the app).
 */
let greetingDelivered = false;

/**
 * Voice conversation controller. `agent` defaults to the standalone Osamah
 * agent; pass `createChatVoiceAgent` to route every spoken turn through the
 * chat conversation instead (transcripts + replies persisted to the chat DB).
 */
export function useVoiceController(
  options: { agent?: AgentStreamFn } = {},
): UseVoiceControllerResult {
  const { agent = agentMessageStream } = options;

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

  // `updateConfig` is declared below the conversation's one-time construction,
  // so the command wrapper reaches it through a ref instead of the closure.
  const updateConfigRef = useRef<typeof updateConfig | null>(null);

  // `t` is captured here so the per-instance event callback (built once, when
  // the conversation is constructed) can look up strings without going stale.
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;

  // The orb's conversation is "started by the user": until they press the orb
  // (or one of their utterances is finalised), nothing may surface a message
  // or an error — the agent's opening greeting covers the app-open, and a
  // pre-start mic/gateway failure stays silent instead of popping an alert.
  const userStartedRef = useRef(false);

  const routeEvent = useCallback((event: ConversationEvent) => {
    switch (event.type) {
      case 'phase':
        setPhase(event.phase);
        if (event.phase === 'listening') {
          setDiag('');
          // A tap-interrupt leaves half-streamed reply text behind — drop it.
          setPartial('');
        }
        break;
      case 'partial':
        setPartial(event.text);
        break;
      case 'diag':
        setDiag(event.text);
        break;
      case 'volume':
        // Drive the orb's mic rings straight from the live VAD level.
        try {
          micLevel.level.set(event.level);
        } catch {}
        break;
      case 'turn':
        if (event.role === 'user') userStartedRef.current = true;
        setTurns((prev) => [...prev, { role: event.role, text: event.text }]);
        if (event.role === 'agent') setPartial('');
        break;
      case 'error': {
        const msg = event.message;
        // Opened / stopped before the user spoke — stay silent, no alert and
        // no red orb; the greeting + idle glow already own that moment.
        if (!userStartedRef.current) {
          setDiag('');
          return;
        }
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
        } else if (msg) {
          // Any other voice failure (recorder open, prepare, VAD, gateway) must
          // never be silent — show it so the loop's problem is diagnosable.
          Alert.alert(tRef.current('voice.errorTitle'), msg, [
            { text: tRef.current('voice.ok'), style: 'cancel' },
          ]);
        }
        break;
      }
      default:
        break;
    }
  }, []);

  if (!conversationRef.current) {
    // Play a synthesized file to completion on the SPEAKER, never the earpiece:
    // after a recording the session is still on .playAndRecord (which routes
    // iOS to the receiver) and a bare category switch is not enough to
    // re-route. Switching off recording then bouncing the session makes iOS
    // re-evaluate its output route against .playback → built-in speaker.
    const playAudio = (uri: string, signal?: AbortSignal): Promise<void> =>
      new Promise((resolve, reject) => {
        // Only guard the startup phase. Once playback has actually started,
        // never impose a wall-clock limit: long agent replies must finish.
        const startupDeadline = Date.now() + 8_000;
        const onAbort = () => done();
        const done = (error?: unknown) => {
          try {
            signal?.removeEventListener('abort', onAbort);
          } catch {}
          if (error) reject(error);
          else resolve();
        };
        setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })
          .then(() => setIsAudioActiveAsync(false))
          .then(() => setIsAudioActiveAsync(true))
          .finally(() => {
            try {
              player.volume = configRef.current.volume;
              player.replace({ uri });
              player.play();
            } catch {
              done(new Error('audio playback failed'));
              return;
            }
            signal?.addEventListener('abort', onAbort, { once: true });
            let started = false;
            const poll = () => {
              const s = playerStatusRef.current;
              if (conversationRef.current?.getPhase() !== 'speaking') {
                done();
                return;
              }
              if (!started) {
                if (s.playing || (s.didJustFinish && s.currentTime > 0)) started = true;
              } else if (s.didJustFinish) {
                done();
                return;
              }
              if (!started && Date.now() > startupDeadline) {
                done(new Error('audio playback timeout'));
                return;
              }
              requestAnimationFrame(poll);
            };
            poll();
          });
      });

    // Spoken voice commands ("غيّر صوتك لذكر بلهجة فصحى", "male voice",
    // "بدّل للصوت ميرا بسورية"، "كريم") are handled here, before the model:
    // the config is patched + persisted (gender, dialect AND character) and a
    // short confirmation is spoken back in the new voice — the request never
    // reaches the agent as a real turn, the transcript stays clean, and by
    // returning normally the reply flows through the usual spoken pipeline.
    const agentWithCommands: AgentStreamFn = async (agentText, agentOpts) => {
      const cmd = parseVoiceCommand(agentText);
      if (cmd && updateConfigRef.current) {
        const next = { ...configRef.current };
        if (cmd.persona) {
          const p = personaById(cmd.persona);
          next.persona = p.id;
          next.gender = p.gender;
        }
        if (cmd.gender) next.gender = cmd.gender;
        if (cmd.locale) next.locale = cmd.locale;
        await updateConfigRef.current(next);
        const tr = (key: any) => tRef.current(key);
        let reply: string;
        if (cmd.persona === 'mira') {
          reply = tr('voice.personaMira');
        } else if (cmd.persona === 'karim') {
          reply = tr('voice.personaKarim');
        } else {
          const genderLabel = tr(
            next.gender === 'male' ? 'voice.genderMale' : 'voice.genderFemale',
          );
          const dialect =
            next.locale === 'ar-SA'
              ? tr('voice.dialectFusha')
              : next.locale === 'ar-SY'
                ? tr('voice.dialectSyrian')
                : '';
          reply =
            `${tr('voice.voiceNow')} ${genderLabel}` +
            (dialect ? ` ${tr('voice.withDialect')} ${dialect}` : '');
        }
        // Stream the confirmation so it is SPOKEN in the freshly-picked voice.
        agentOpts.onDelta?.(reply);
        return { reply, sessionId: agentOpts.sessionId ?? `voicecmd-${Date.now()}` };
      }
      // A non-command turn: seed the active character into the model prompt so
      // the reply's content matches the chosen voice.
      const persona = personaById(configRef.current.persona);
      return agent(agentText, {
        ...agentOpts,
        personaHint: persona.id === 'osamah' ? undefined : persona.hint,
      });
    };

    const conversation = new Conversation({
      config: () => configRef.current,
      continuous: () => continuousRef.current,
      // Snappy echo guard: a brief mic mute after each spoken beat so the
      // reply can't echo back into a fresh turn, without feeling like a deaf
      // pause between exchanges.
      echoCooldownMs: 600,
      recorder: createRecognizer(),
      agent: agentWithCommands,
      synthesize: (text, signal, frozen) =>
        synthesizeSpeech(text, frozen ?? configRef.current, { signal }),
      play: (uri, signal) => playAudio(uri, signal),
      speakNative: (text, signal, frozen) =>
        speakNativeSpeech(text, frozen ?? configRef.current, signal),
      stopSpeech: () => {
        try {
          player.pause();
        } catch {}
      },
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
      // The agent speaks first, without the user saying a word — but only on
      // the very first launch of this app session, never again when the home
      // screen re-mounts or the user comes back to it. Any pre-start failure
      // is silent by design (see userStartedRef above), so opening the app
      // never shows a message or an error.
      if (!cancelled && !greetingDelivered && !userStartedRef.current) {
        greetingDelivered = true;
        conversationRef.current?.greet(tRef.current('voice.greeting'));
      }
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
    userStartedRef.current = true;
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
   * The orb is the conversation's switch — the floor is always yours:
   * idle → start listening, speaking/thinking → cut in (audio stops, the
   * mic opens so you can answer), listening → full stop. Utterances end by
   * themselves through the VAD silence gate, so a press while listening is
   * a real stop, and a press while speaking is real as well — it breaks in.
   */
  const toggle = useCallback(() => {
    const c = conversationRef.current;
    if (!c) return;
    const p = c.getPhase();
    if (p === 'idle') {
      start();
    } else if (p === 'speaking' || p === 'thinking') {
      c.interrupt();
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
  updateConfigRef.current = updateConfig;

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
