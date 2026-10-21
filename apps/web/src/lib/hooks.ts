import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/** Fetch a URL and keep it fresh: refetches every `ms` while the tab is visible, and on focus. */
export function useLive<T>(url: string | null, ms = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const urlRef = useRef(url);
  urlRef.current = url;

  const reload = useCallback(async () => {
    if (!urlRef.current) return;
    try {
      setData(await api<T>(urlRef.current));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setData(null);
    reload();
    const tick = () => document.visibilityState === 'visible' && reload();
    const id = setInterval(tick, ms);
    window.addEventListener('focus', reload);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', reload);
    };
  }, [url, ms, reload]);

  return { data, error, reload };
}

export function ago(iso: string | null | undefined) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

export const fmtDay = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
