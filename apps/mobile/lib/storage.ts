/**
 * Storage abstraction. Production should use expo-secure-store for tokens
 * (install: expo install expo-secure-store) and @react-native-async-storage
 * for non-sensitive state. Until then, in-memory fallback is used — state
 * resets on app restart, which is safe for development.
 *
 * TODO(session-16): replace MemoryStore with SecureStore + AsyncStorage.
 * SecureStore: import * as SecureStore from 'expo-secure-store';
 * AsyncStorage: import AsyncStorage from '@react-native-async-storage/async-storage';
 */

interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

class MemoryStore implements StorageAdapter {
  private store = new Map<string, string>();

  async getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  async removeItem(key: string) {
    this.store.delete(key);
  }
}

const secureStore: StorageAdapter = new MemoryStore();
const regularStore: StorageAdapter = new MemoryStore();

/** For auth tokens and other sensitive values. */
export const SecureKV = {
  get: (key: string) => secureStore.getItem(key),
  set: (key: string, value: string) => secureStore.setItem(key, value),
  remove: (key: string) => secureStore.removeItem(key),
};

/** For preferences, onboarding flags and other non-sensitive state. */
export const KV = {
  get: (key: string) => regularStore.getItem(key),
  set: (key: string, value: string) => regularStore.setItem(key, value),
  remove: (key: string) => regularStore.removeItem(key),
};
