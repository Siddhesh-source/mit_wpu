import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Me } from '@plc/shared';
import { api, ApiError, auth } from './api';

interface Session {
  me: Me | null;
  loading: boolean;
  login: (userId: string, pin: string) => Promise<Me>;
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

  const login = useCallback(async (userId: string, pin: string) => {
    const { token } = await api<{ token: string }>('/api/auth/login', { method: 'POST', json: { userId, pin } });
    auth.set(token);
    const m = await api<Me>('/api/me');
    setMe(m);
    keepMe(m);
    return m;
  }, []);

  const logout = useCallback(() => {
    auth.set(null);
    keepMe(null);
    setMe(null);
  }, []);

  return <Ctx.Provider value={{ me, loading, login, logout }}>{children}</Ctx.Provider>;
}
