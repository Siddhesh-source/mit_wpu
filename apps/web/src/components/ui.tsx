import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, STATUS_LABEL, type RequestStatus } from '@plc/shared';
import { useSession } from '../lib/session';

const PILL: Record<RequestStatus, string> = {
  in_review: 'bg-panel text-accent',
  approved: 'bg-ok-bg text-ok',
  rejected: 'bg-bad-bg text-bad',
  returned: 'bg-warn-bg text-warn',
};

export function StatusPill({ status }: { status: RequestStatus }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[status]}`}>{STATUS_LABEL[status]}</span>;
}

/** Page frame: name + role on the left, back or switch-profile on the right. */
export function Page({ children, back }: { children: ReactNode; back?: string }) {
  const { me, logout } = useSession();
  const nav = useNavigate();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 pb-10 pt-5">
      <header className="mb-4 flex items-center justify-between">
        {back ? (
          <Link to={back} className="link -ml-1 text-base">
            ← Back
          </Link>
        ) : (
          <div>
            <p className="font-semibold">{me?.name}</p>
            <p className="text-xs text-muted">{me?.roles.map((r) => ROLE_LABEL[r]).join(' · ')}</p>
          </div>
        )}
        <button className="link" onClick={() => (logout(), nav('/login'))}>
          Switch profile
        </button>
      </header>
      {children}
    </main>
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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-bg px-5 pb-8 pt-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-rule" />
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
      <div className="rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg">{msg}</div>
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
