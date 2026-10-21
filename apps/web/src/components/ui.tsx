import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, STATUS_LABEL, type RequestStatus } from '@plc/shared';
import { useSession } from '../lib/session';
import { ThemeToggle } from './ThemeToggle';

const PILL: Record<RequestStatus, string> = {
  in_review: 'bg-panel text-accent',
  approved: 'bg-ok-bg text-ok',
  rejected: 'bg-bad-bg text-bad',
  returned: 'bg-warn-bg text-warn',
  sealing: 'bg-panel text-accent',
  sealed: 'bg-ok-bg text-ok',
  amending: 'bg-warn-bg text-warn',
  revoked: 'bg-bad-bg text-bad',
};

export function StatusPill({ status }: { status: RequestStatus }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[status]}`}>{STATUS_LABEL[status]}</span>;
}

/**
 * Page frame. Phone: one column with name/back on the left and Log out on the right.
 * Desktop: a header bar with the product name, the signed-in person (links to the profile) and Log out; content is
 * `narrow` (forms, single CTA) or `wide` (two-column layouts).
 */
export function Page({ children, back, wide = false }: { children: ReactNode; back?: string; wide?: boolean }) {
  const { me, logout } = useSession();
  const nav = useNavigate();
  const who = (
    <Link to="/profile" className="block md:text-right" title="Your profile">
      <p className="font-semibold">{me?.name}</p>
      <p className="text-xs text-muted">{me?.roles.map((r) => ROLE_LABEL[r]).join(' · ')}</p>
    </Link>
  );
  return (
    <div className="flex min-h-screen flex-col">
      <header className="md:border-b md:border-rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pt-5 md:px-8 md:py-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="hidden text-lg font-bold md:block">
              CampusSign
            </Link>
            {back ? (
              <Link to={back} className="link -ml-1 text-base">
                ← Back
              </Link>
            ) : (
              <div className="md:hidden">{who}</div>
            )}
          </div>
          <div className="flex items-center gap-4 md:gap-5">
            <div className="hidden md:block">{who}</div>
            <ThemeToggle />
            <button className="link" onClick={() => (logout(), nav('/login'))}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className={`mx-auto flex w-full flex-1 flex-col px-4 pb-10 pt-5 md:px-8 md:pt-10 ${wide ? 'max-w-5xl' : 'max-w-md md:max-w-xl'}`}>
        {children}
      </main>
    </div>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/** 4-digit PIN pad. Calls onComplete with the PIN; parent clears it via the `reset` counter. */
export function PinPad({ onComplete, busy, reset = 0 }: { onComplete: (pin: string) => void; busy?: boolean; reset?: number }) {
  const [pin, setPin] = useState('');
  useEffect(() => setPin(''), [reset]);

  function press(k: string) {
    if (busy || !k) return;
    if (k === '⌫') return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) onComplete(next);
  }

  return (
    <div className="flex flex-col items-center">
      <div className="mb-4 flex gap-3" aria-label="PIN">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-4 w-4 rounded-full border-2 border-accent ${i < pin.length ? 'bg-accent' : ''}`} />
        ))}
      </div>
      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {KEYS.map((k, i) => (
          <button
            key={i}
            type="button"
            onClick={() => press(k)}
            disabled={!k || busy}
            className={`h-14 rounded-2xl text-2xl font-semibold ${k ? 'bg-panel active:bg-rule' : 'invisible'}`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Bottom sheet, the only overlay in the app. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-bg px-5 pb-8 pt-5 shadow-xl md:rounded-3xl md:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-rule md:hidden" />
        {children}
      </div>
    </div>
  );
}

let pushToast: (msg: string) => void = () => {};
export const toast = (msg: string) => pushToast(msg);

export function Toaster() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    pushToast = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(''), 3500);
    };
  }, []);
  if (!msg) return null;
  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="rounded-xl bg-ink px-4 py-3 text-sm text-bg shadow-lg">{msg}</div>
    </div>
  );
}

export function Tick({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function Cross({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}
