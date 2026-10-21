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
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!auth.token);

  useEffect(() => {
    if (!auth.token) return;
    api<Me>('/api/me')
      .then(setMe)
      // Sign out only when the server says the session is invalid, not on a network blip or aborted fetch.
      .catch((e) => e instanceof ApiError && e.status === 401 && auth.set(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (userId: string, pin: string) => {
    const { token } = await api<{ token: string }>('/api/auth/login', { method: 'POST', json: { userId, pin } });
    auth.set(token);
    const m = await api<Me>('/api/me');
    setMe(m);
    return m;
  }, []);

  const logout = useCallback(() => {
    auth.set(null);
    setMe(null);
  }, []);

  return <Ctx.Provider value={{ me, loading, login, logout }}>{children}</Ctx.Provider>;
}
