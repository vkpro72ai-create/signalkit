/**
 * Storage abstraction.
 *
 * SecureKV  — expo-secure-store on native (hardware-backed on Android API 23+),
 *             localStorage on web.  Use for auth tokens and sensitive values.
 *
 * KV        — @react-native-async-storage/async-storage on native,
 *             localStorage on web. Use for preferences and onboarding flags.
 *
 * Both adapters persist across app restarts.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Sensitive values (auth tokens). Backed by hardware Keystore on Android. */
export const SecureKV = {
  get: (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null);
    }
    return SecureStore.getItemAsync(key);
  },

  set: (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },

  remove: (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};

/** Non-sensitive preferences (onboarding flags, locale, etc.). */
export const KV = {
  get: (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null);
    }
    return AsyncStorage.getItem(key);
  },

  set: (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  },

  remove: (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(key);
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  },
};
