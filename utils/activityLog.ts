import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'osamah.activity.v1';
export type ActivityLogEntry = { id: string; source: 'search'; title: string; detail: string; at: number };

export async function addActivity(entry: Omit<ActivityLogEntry, 'id' | 'at'>): Promise<void> {
  try {
    const current = await listActivities();
    const next: ActivityLogEntry = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, at: Date.now() };
    await AsyncStorage.setItem(KEY, JSON.stringify([next, ...current].slice(0, 200)));
  } catch {}
}

export async function listActivities(): Promise<ActivityLogEntry[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); } catch { return []; }
}

export async function clearActivities(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
