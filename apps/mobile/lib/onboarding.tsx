/**
 * Onboarding state — tracks whether the user has completed onboarding.
 * Uses KV (memory in dev, AsyncStorage in production).
 * TODO(session-16): replace KV with AsyncStorage for persistence across restarts.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { KV } from './storage';

const KEY = 'signalkit_onboarded';

export type OnboardingState = {
  hasOnboarded: boolean;
  isLoading: boolean;
  complete: () => Promise<void>;
  reset: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    KV.get(KEY).then((v) => {
      setHasOnboarded(v === 'true');
      setIsLoading(false);
    });
  }, []);

  async function complete() {
    await KV.set(KEY, 'true');
    setHasOnboarded(true);
  }

  async function reset() {
    await KV.remove(KEY);
    setHasOnboarded(false);
  }

  return (
    <OnboardingContext.Provider value={{ hasOnboarded, isLoading, complete, reset }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
