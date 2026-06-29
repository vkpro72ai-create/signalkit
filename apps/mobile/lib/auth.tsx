/**
 * AuthContext — auth state with persistent token storage via SecureStore.
 *
 * Demo mode: loginDemo() sets a mock user without API contact.
 * Use for UI auditing when the backend is not reachable.
 * isDemo flag lets screens show a "DEMO MODE" banner.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, setApiToken, type MeResponse } from './api';
import { SecureKV } from './storage';

const TOKEN_KEY = 'signalkit_access_token';

export type AuthUser = MeResponse;

const DEMO_USER: AuthUser = {
  id: 'demo',
  email: 'demo@signalkit.app',
  name: 'Demo User',
  displayName: 'Demo User',
  workspaces: [],
};

export type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isDemo: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  loginDemo: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureKV.get(TOKEN_KEY);
        if (token) {
          setApiToken(token);
          const me = await authApi.me();
          setUser(me);
        }
      } catch {
        // Token invalid or expired — clear silently
        await SecureKV.remove(TOKEN_KEY);
        setApiToken(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const { accessToken } = await authApi.login(email, password);
    await SecureKV.set(TOKEN_KEY, accessToken);
    setApiToken(accessToken);
    const me = await authApi.me();
    setUser(me);
    setIsDemo(false);
  }

  async function register(email: string, password: string, displayName?: string) {
    const { accessToken } = await authApi.register(email, password, displayName);
    await SecureKV.set(TOKEN_KEY, accessToken);
    setApiToken(accessToken);
    const me = await authApi.me();
    setUser(me);
    setIsDemo(false);
  }

  function loginDemo() {
    setUser(DEMO_USER);
    setIsDemo(true);
  }

  async function logout() {
    await SecureKV.remove(TOKEN_KEY);
    setApiToken(null);
    setUser(null);
    setIsDemo(false);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isDemo,
        login,
        register,
        loginDemo,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
