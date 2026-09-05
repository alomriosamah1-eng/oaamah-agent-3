// Voice Chat Panel — now a pure UI observer of the new VoiceEngine.
//
// Everything the old panel did by hand (server ping, LAN client, recorder,
// playback queue, transcription) now lives in `utils/voice/` and the
// `useVoiceController` hook. This file only renders: the same glass card, the
// same VoiceOrb with the same input/output levels, plus a provider status line
// and gender/locale preferences. The orb visuals are preserved exactly.

import { Pressable, ScrollView, StyleSheet, Text, View, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon, DeepViolet, Red, Amber, Green } from '@/theme/colors';
import { GlassCard } from '@/theme/GlassComponents';
import { Spacer } from '@/theme/primitives';
import { useI18n } from '@/i18n/provider';
import { VoiceOrb } from '@/utils/orbs';
import { useVoiceController } from '@/utils/voice/useVoiceController';

const ORB_STATE = {
  idle: 'idle' as const,
  listening: 'listening' as const,
  thinking: 'thinking' as const,
  speaking: 'speaking' as const,
};

export function VoiceChatPanel() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const voice = useVoiceController();

  const statusLabel =
    voice.phase === 'listening'
      ? t('voice.statusListening')
      : voice.phase === 'thinking'
        ? t('voice.statusThinking')
        : voice.phase === 'speaking'
          ? t('voice.statusSpeaking')
          : t('voice.statusIdle');

  const orbState = ORB_STATE[voice.phase];

  const onMicPress = () => {
    if (voice.phase === 'listening') {
      voice.toggle();
    } else if (voice.phase === 'idle') {
      voice.toggle();
    } else {
      voice.stop();
    }
  };

  return (
    <GlassCard cornerRadius={20} style={{ overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={styles.titleIcon}>
          <MaterialIcons name="mic" size={20} color={CyanNeon} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
            {t('voice.title')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }} numberOfLines={1}>
            {t('voice.subtitle')}
          </Text>
        </View>
      </View>

      {/* Provider route + preferences */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {(['male', 'female'] as const).map((g) => (
          <Pressable
            key={g}
            disabled={voice.phase === 'speaking' || voice.phase === 'listening' || voice.phase === 'thinking'}
            onPress={() => void voice.updateConfig({ gender: g })}
            style={({ pressed }) => [
              styles.voiceChip,
              {
                borderColor: voice.config.gender === g ? withAlpha(CyanNeon, 0.8) : withAlpha(colors.outline, 0.3),
                backgroundColor: voice.config.gender === g ? withAlpha(CyanNeon, 0.12) : 'transparent',
              },
              pressed && { opacity: 0.7 },
            ]}>
            <MaterialIcons
              name={g === 'male' ? 'record-voice-over' : 'spa'}
              size={14}
              color={voice.config.gender === g ? CyanNeon : colors.onSurfaceVariant}
            />
            <Text style={{ color: voice.config.gender === g ? CyanNeon : colors.onSurfaceVariant, ...(typography.labelSmall as any), fontWeight: FontWeights.medium }}>
              {g === 'male' ? t('voice.voiceMale') : t('voice.voiceFemale')}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.orbWrap}>
        <VoiceOrb
          state={orbState}
          size={150}
          color={CyanNeon}
          colorTo={DeepViolet}
          colorSpread={0.6}
          inputAmplitude={voice.micLevel.level}
          inputLevels={{ low: voice.micLevel.level, mid: voice.micLevel.level, high: voice.micLevel.level }}
          outputAmplitude={voice.outputLevels.level}
          outputLevels={voice.outputLevels}
        />
        <Text style={[styles.status, { color: colors.onSurface }]}>{statusLabel}</Text>

        {(voice.phase === 'listening' || voice.phase === 'thinking' || voice.phase === 'speaking') && voice.partial.length > 0 ? (
          <Text style={[styles.interim, { color: colors.primary }]} numberOfLines={2}>
            {voice.partial}
          </Text>
        ) : null}

        {voice.diag.length > 0 ? (
          <Text style={[styles.interim, { color: colors.onSurfaceVariant }]} numberOfLines={2}>
            🔎 {voice.diag}
          </Text>
        ) : null}

        {voice.lastError.length > 0 ? (
          <Text style={[styles.interim, { color: colors.onSurfaceVariant }]} numberOfLines={2}>
            {lastErrorText(voice.lastError, t('voice.agentErrorBody'))}
          </Text>
        ) : null}
      </View>

      <View style={[styles.transcriptBox, { backgroundColor: withAlpha(colors.surfaceVariant, 0.4) }]}>
        {voice.turns.length === 0 ? (
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any), textAlign: 'center' }}>
            {t('voice.transcriptEmpty')}
          </Text>
        ) : (
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }} showsVerticalScrollIndicator={false}>
            {voice.turns.slice(-6).map((turn, i) => (
              <Text
                key={i}
                numberOfLines={3}
                style={{
                  color: colors.onSurface,
                  ...(typography.bodySmall as any),
                  textAlign: turn.role === 'user' ? 'right' : 'left',
                }}>
                <Text style={{ fontWeight: FontWeights.bold }}>
                  {turn.role === 'user' ? t('voice.you') : t('voice.agent') + ': '}
                </Text>
                {turn.text}
              </Text>
            ))}
          </ScrollView>
        )}
      </View>

      <Spacer h={14} />

      <View style={{ alignItems: 'center' }}>
        <Pressable
          onPress={onMicPress}
          style={({ pressed }) => [
            styles.micButton,
            { backgroundColor: voice.phase === 'idle' ? colors.primary : voice.phase === 'listening' ? Red : withAlpha(Amber, 0.85) },
            pressed && { transform: [{ scale: 0.95 }] },
          ]}>
          <MaterialIcons
            name={voice.phase === 'listening' ? 'stop' : voice.phase === 'idle' ? 'mic' : 'autorenew'}
            size={30}
            color={voice.phase === 'idle' ? '#000' : '#fff'}
          />
        </Pressable>
        <Spacer h={8} />
        <Text style={{ color: colors.onSurfaceVariant, ...(typography.labelMedium as any) }}>
          {voice.phase === 'listening'
            ? t('voice.stop')
            : voice.phase === 'idle'
              ? t('voice.tapToListen')
              : ''}
        </Text>
        {voice.providerLine ? (
          <Text style={{ color: withAlpha(colors.onSurfaceVariant, 0.7), ...(typography.labelSmall as any) }} numberOfLines={1}>
            {voice.providerLine}
          </Text>
        ) : null}
        {voice.sttNeedsGateway ? (
          <Text
            style={{
              color: withAlpha(Amber, 0.95),
              ...(typography.labelSmall as any),
              textAlign: 'center',
              marginTop: 6,
              paddingHorizontal: 18,
            }}
            numberOfLines={2}>
            ⚙️ {t('voice.cloudSttNeedsGateway')}
          </Text>
        ) : null}
      </View>
    </GlassCard>
  );
}

function lastErrorText(err: string, fallback: string): string {
  // Only surface raw device errors that are user-meaningful; otherwise fall
  // back to the friendly localised message.
  if (!err) return '';
  return fallback;
}

const styles = StyleSheet.create({
  titleIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,240,255,0.12)',
    marginEnd: 12,
  },
  voiceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  orbWrap: { alignItems: 'center', paddingVertical: 10 },
  status: { marginTop: 6, ...(typography.titleSmall as any), fontWeight: FontWeights.bold },
  interim: {
    marginTop: 4,
    paddingHorizontal: 18,
    textAlign: 'center',
    ...(typography.bodySmall as any),
  },
  transcriptBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 12,
    minHeight: 56,
    maxHeight: 140,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});