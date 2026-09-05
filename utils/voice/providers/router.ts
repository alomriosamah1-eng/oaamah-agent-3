// Ordered failover router. Policy is intentionally simple and predictable:
//   auto    -> azure, google, android(native)
//   azure   -> azure, android(native)
//   google  -> google, android(native)
//   android -> android(native) only
//
// The platform TTS is ALWAYS the last tier so a sentence still plays even when
// every cloud provider fails and no gateway is configured. Each provider gets
// one bounded attempt with a timeout; there is no retry storm.

import { ProviderId, TtsRequest, TtsResult, TtsProviderRouter, VoiceProvider, ProviderMode } from './types';
import { azureProvider } from './azure';
import { googleProvider } from './google';
import { androidNativeProvider } from './native';
import { voiceLog } from '../log';
import { voiceGatewayUrl } from './gateway';

const CLOUD_TIMEOUT = 25_000;
const CHAIN: Record<ProviderId, VoiceProvider> = {
  azure: azureProvider,
  google: googleProvider,
  android: androidNativeProvider,
};

function orderFor(mode: ProviderMode): ProviderId[] {
  switch (mode) {
    case 'auto':
      return ['azure', 'google', 'android'];
    case 'azure':
      return ['azure', 'android'];
    case 'google':
      return ['google', 'android'];
    case 'android':
      return ['android'];
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function createVoiceRouter(): TtsProviderRouter {
  let lastFailing: ProviderId | null = null;

  return {
    async synthesize(request: TtsRequest) {
      const providers = orderFor(request.mode);
      let lastError: Error | null = null;

      for (const id of providers) {
        const provider = CHAIN[id];
        try {
          if (!(await provider.isAvailable())) {
            lastError = new Error(`${id} unavailable`);
            voiceLog('VOICE_PROVIDER_FAILED', id);
            continue;
          }
          const attempt = provider.synthesize(request);
          const result =
            id === 'android'
              ? await attempt
              : await withTimeout(attempt, CLOUD_TIMEOUT, id);
          lastFailing = null;
          voiceLog('VOICE_PROVIDER_SELECTED', id);
          return result;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          lastFailing = id;
          voiceLog('VOICE_PROVIDER_FAILED', `${id}: ${lastError.message}`);
          voiceLog('VOICE_FAILOVER', `next=${providers[providers.indexOf(id) + 1] ?? 'none'}`);
        }
      }

      // Nothing could speak — surface the most useful signal.
      throw lastError ?? new Error('no voice provider available');
    },

    cancel() {
      azureProvider.cancel();
      googleProvider.cancel();
      androidNativeProvider.cancel();
      voiceLog('VOICE_CANCELLED', 'all');
    },
  };
}

/** Newline-delimited provider list for the development/stats line. */
export async function describeRoute(mode: ProviderMode): Promise<string> {
  const parts: string[] = [];
  for (const id of orderFor(mode)) {
    const ok = await CHAIN[id].isAvailable().catch(() => false);
    parts.push(`${id}:${ok ? 'on' : 'off'}`);
  }
  if (parts.length) parts.push(`gw:${voiceGatewayUrl() ? 'set' : 'none'}`);
  return parts.join(' · ');
}