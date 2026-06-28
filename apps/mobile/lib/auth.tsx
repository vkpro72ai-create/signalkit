/**
 * AuthContext — in-memory auth state with token persistence.
 * Token is stored via SecureKV (memory in dev, SecureStore in production).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, setApiToken, type MeResponse } from './api';
import { SecureKV } from './storage';

const TOKEN_KEY = 'signalkit_access_token';

export type AuthUser = MeResponse;

export type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
  }

  async function register(email: string, password: string, name?: string) {
    const { accessToken } = await authApi.register(email, password, name);
    await SecureKV.set(TOKEN_KEY, accessToken);
    setApiToken(accessToken);
    const me = await authApi.me();
    setUser(me);
  }

  async function logout() {
    await SecureKV.remove(TOKEN_KEY);
    setApiToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, register, logout }}
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
