// User Profile storage layer — persistence via AsyncStorage.
// All pure logic (fields, groups, context building, parsing) lives in
// utils/profileModel.ts so it is Node-testable.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_PROFILE,
  normalizeProfile,
  PROFILE_KEY,
  UserProfile,
} from '@/utils/profileModel';

export async function loadProfile(): Promise<UserProfile> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    return normalizeProfile(JSON.parse(raw) as Partial<UserProfile>);
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  const merged = { ...profile, lastUpdated: Date.now() };
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
}

export async function updateProfileField<K extends keyof UserProfile>(key: K, value: UserProfile[K]): Promise<UserProfile> {
  const profile = await loadProfile();
  const patch: Partial<UserProfile> = {};
  patch[key] = value;
  const updated = normalizeProfile({ ...profile, ...patch });
  updated.lastUpdated = Date.now();
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
  return updated;
}

export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_KEY);
}

export * from '@/utils/profileModel';