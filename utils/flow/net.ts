import { useEffect, useState } from 'react';
import * as Network from 'expo-network';

/**
 * Tracks internet reachability. Returns `null` until the first probe resolves
 * (treat null as connected to avoid a false "offline" flash).
 */
export function useOnline(): { online: boolean; checking: boolean } {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (mounted) setOnline(state.isInternetReachable ?? state.isConnected ?? true);
      } catch {
        if (mounted) setOnline(true);
      }
    })();

    const sub = Network.addNetworkStateListener((event) => {
      setOnline(event.isInternetReachable ?? event.isConnected ?? true);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return { online: online ?? true, checking: online === null };
}