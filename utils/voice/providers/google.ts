// Secondary provider — Google Cloud TTS. Fully independent of Azure: it has its
// own voice table and its own gateway path, so failing over never couples the
// two. Google Premium/neural voices are chosen server-side by the gateway.

import { gatewayTts, isVoiceGatewayConfigured, gatewayStatus } from './gateway';
import { VoiceProvider, TtsRequest, TtsResult, ProviderCapabilities } from './types';
import { VOICE_CATALOG } from '../catalog';

const capabilities: ProviderCapabilities = { offline: false, streaming: true };

export const googleProvider: VoiceProvider = {
  id: 'google',
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
    const entry = VOICE_CATALOG[request.locale as keyof typeof VOICE_CATALOG];
    const voice = request.voiceId ?? entry?.google[request.gender] ?? 'ar-XA-Wavenet-B';
    const { uri } = await gatewayTts(
      {
        provider: 'google',
        text: request.text,
        locale: request.locale,
        gender: request.gender,
        voice,
        speechRate: request.speechRate,
        pitch: request.pitch,
        volume: request.volume,
      },
      request.signal,
    );
    return { provider: 'google', uri, kind: 'uri' };
  },

  cancel() {},
};