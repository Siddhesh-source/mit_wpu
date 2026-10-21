import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Me } from '@plc/shared';
import { api, ApiError, auth } from './api';

interface Session {
  me: Me | null;
  loading: boolean;
  /** Email + password. */
  login: (email: string, password: string) => Promise<Me>;
  signup: (body: Record<string, string>) => Promise<Me>;
  refresh: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<Session>(null!);
const ME = 'plc.me';

const cachedMe = (): Me | null => {
  try {
    return JSON.parse(localStorage.getItem(ME) ?? 'null');
  } catch {
    return null;
  }
};
const keepMe = (m: Me | null) => {
  try {
    m ? localStorage.setItem(ME, JSON.stringify(m)) : localStorage.removeItem(ME);
  } catch {
    /* ignore */
  }
};
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!auth.token);

  useEffect(() => {
    if (!auth.token) return;
    api<Me>('/api/me')
      .then((m) => (setMe(m), keepMe(m)))
      // Sign out only when the server says the session is invalid. Offline (e.g. the guard at the gate),
      // keep the last known profile so the app still opens.
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          auth.set(null);
          keepMe(null);
        } else setMe(cachedMe());
      })
      .finally(() => setLoading(false));
  }, []);

  const start = useCallback(async (token: string) => {
    auth.set(token);
    const m = await api<Me>('/api/me');
    setMe(m);
    keepMe(m);
    return m;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => start((await api<{ token: string }>('/api/auth/login', { method: 'POST', json: { email, password } })).token),
    [start],
  );
  const signup = useCallback(
    async (body: Record<string, string>) => start((await api<{ token: string }>('/api/auth/signup', { method: 'POST', json: body })).token),
    [start],
  );
  const refresh = useCallback(async () => {
    const m = await api<Me>('/api/me');
    setMe(m);
    keepMe(m);
  }, []);

  const logout = useCallback(() => {
    auth.set(null);
    keepMe(null);
    setMe(null);
  }, []);

  return <Ctx.Provider value={{ me, loading, login, signup, refresh, logout }}>{children}</Ctx.Provider>;
}
