import AsyncStorage from '@react-native-async-storage/async-storage';

export const SPEAK_OUTPUT_KEY = 'speakOutput';
export const CUSTOM_MODEL_KEY = 'customModel';
export const NAME_KEY = 'userName';

export const PREFIX = 'chatgpt:';

// API key / connection settings (kept in AsyncStorage so the app runs in Expo Go)
export const keyStorage = {
  getString: (key: string) => AsyncStorage.getItem(PREFIX + key),
  set: (key: string, value: string) => AsyncStorage.setItem(PREFIX + key, value),
  delete: (key: string) => AsyncStorage.removeItem(PREFIX + key),
};

// App preferences (model version, custom model, speak output)
export const storage = {
  getString: (key: string) => AsyncStorage.getItem(PREFIX + key),
  set: (key: string, value: string) => AsyncStorage.setItem(PREFIX + key, value),
  delete: (key: string) => AsyncStorage.removeItem(PREFIX + key),
};