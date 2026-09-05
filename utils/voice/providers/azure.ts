// Primary provider — Microsoft Azure Speech (neural voices). All requests go
// through the voice gateway; no Azure credential is ever bundled in the app.

import { gatewayTts, isVoiceGatewayConfigured, gatewayStatus } from './gateway';
import { VoiceProvider, TtsRequest, TtsResult, ProviderCapabilities } from './types';
import { VOICE_CATALOG } from '../catalog';

const capabilities: ProviderCapabilities = { offline: false, streaming: true };

export const azureProvider: VoiceProvider = {
  id: 'azure',
  capabilities,

  async isAvailable() {
    return isVoiceGatewayConfigured() && (await gatewayStatus());
  },

  async getSupportedLocales() {
    return [
      'ar-SY',
      'ar-YE',
      'ar-SA',
      'ar-EG',
      'ar-AE',
      'ar-JO',
      'ar-IQ',
      'ar-KW',
      'ar-LB',
      'ar-OM',
      'ar-QA',
    ];
  },

  async synthesize(request: TtsRequest) {
    const voiceId =
      request.voiceId ??
      (request.locale.startsWith('ar-')
        ? azureVoiceId(request.locale, request.gender)
        : undefined);
    const { uri } = await gatewayTts(
      {
        provider: 'azure',
        text: request.text,
        locale: request.locale,
        gender: request.gender,
        voice: voiceId ?? '',
        speechRate: request.speechRate,
        pitch: request.pitch,
        volume: request.volume,
      },
      request.signal,
    );
    return { provider: 'azure', uri, kind: 'uri' };
  },

  cancel() {
    // gateway requests are aborted via their own AbortController
  },
};

function azureVoiceId(locale: string, gender: 'male' | 'female'): string {
  const entry = VOICE_CATALOG[locale as keyof typeof VOICE_CATALOG];
  return (entry?.azure[gender] ?? VOICE_CATALOG['ar-SY'].azure[gender]) as string;
}