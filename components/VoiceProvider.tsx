import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useVoiceController, type UseVoiceControllerResult } from '@/utils/voice/useVoiceController';
import { createChatVoiceAgent, buildChatSystem } from '@/utils/voice/chatAgent';

// The voice conversation lives HERE — mounted once with the tabs navigator, so
// switching between app sections (or the home orb detaching) never stops the
// mic, the speech, or the agent turn. Only an explicit orb press → stop closes
// it, exactly when the user asks.
const VoiceContext = createContext<UseVoiceControllerResult | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const agent = useMemo(
    () => createChatVoiceAgent({ db: db, buildSystem: buildChatSystem }),
    [db],
  );
  const voice = useVoiceController({ agent });
  return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>;
}

export function useVoice(): UseVoiceControllerResult {
  const voice = useContext(VoiceContext);
  if (!voice) throw new Error('useVoice must be used inside <VoiceProvider>.');
  return voice;
}