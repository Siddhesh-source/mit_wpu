import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { APPROVER_ROLES, ROLE_LABEL, STATUS_LABEL, type InboxItem, type RequestStatus, type Role } from '@plc/shared';
import { useSession } from '../lib/session';
import { useLive } from '../lib/hooks';
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

type NavItem = { to: string; label: string; badge?: number; end?: boolean };

/** Top bar destinations for this person's roles. `waiting` = items waiting for their signature. */
function navFor(roles: Role[], waiting: number): NavItem[] {
  if (roles.includes('student'))
    return [
      { to: '/student', label: 'Home', end: true },
      { to: '/student/new', label: 'New request' },
      { to: '/student/send', label: 'Send a document' },
      { to: '/inbox', label: 'To sign', badge: waiting },
      { to: '/verify', label: 'Verify' },
    ];
  const items: NavItem[] = [];
  if (roles.includes('security')) items.push({ to: '/gate', label: 'Gate' });
  if (roles.some((r) => APPROVER_ROLES.includes(r)))
    items.push({ to: '/inbox', label: 'Dashboard', badge: waiting }, { to: '/people', label: 'People' }, { to: '/history', label: 'History' });
  if (roles.includes('admin')) items.push({ to: '/admin', label: 'Admin' });
  items.push({ to: '/verify', label: 'Verify' });
  return items;
}

function TopNav({ items, className = '' }: { items: NavItem[]; className?: string }) {
  return (
    <nav className={`flex gap-1 ${className}`} aria-label="Main">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          className={({ isActive }) =>
            `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${isActive ? 'bg-panel text-ink' : 'text-muted hover:text-ink'}`
          }
        >
          {i.label}
          {!!i.badge && <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold leading-5 text-white">{i.badge}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Page frame: a top bar with the product name, the role's main destinations (with the waiting count), the signed-in
 * person (links to the profile), theme and Log out. Below `lg` the destinations scroll in a row under the bar.
 * Content is `narrow` (forms, single CTA) or `wide` (dashboards, two-column layouts).
 */
export function Page({ children, back, wide = false }: { children: ReactNode; back?: string; wide?: boolean }) {
  const { me, logout } = useSession();
  const nav = useNavigate();
  const { data: waiting } = useLive<InboxItem[]>(me ? '/api/inbox' : null, 20_000);
  const items = me ? navFor(me.roles, waiting?.length ?? 0) : [];
  const who = (
    <Link to="/profile" className="block min-w-0 md:text-right" title="Your profile">
      <p className="truncate font-semibold">{me?.name}</p>
      <p className="truncate text-xs text-muted">{me?.roles.map((r) => ROLE_LABEL[r]).join(' · ')}</p>
    </Link>
  );
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-rule bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-6">
            <Link to="/" className="flex shrink-0 items-center gap-2 text-lg font-bold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white">
                <Tick className="h-4 w-4" />
              </span>
              <span className="hidden sm:inline">CampusSign</span>
            </Link>
            {back && (
              <Link to={back} className="link -ml-2 shrink-0 text-base lg:hidden">
                ← Back
              </Link>
            )}
            <TopNav items={items} className="hidden lg:flex" />
          </div>
          <div className="flex min-w-0 items-center gap-4 md:gap-5">
            <div className="min-w-0 max-w-[10rem] md:max-w-[14rem]">{who}</div>
            <ThemeToggle />
            <button className="link shrink-0" onClick={() => (logout(), nav('/login'))}>
              Log out
            </button>
          </div>
        </div>
        {items.length > 0 && (
          <div className="mx-auto max-w-6xl overflow-x-auto px-3 pb-2 lg:hidden">
            <TopNav items={items} />
          </div>
        )}
      </header>
      <main className={`mx-auto flex w-full flex-1 flex-col px-4 pb-10 pt-5 md:px-8 md:pt-8 ${wide ? 'max-w-6xl' : 'max-w-md md:max-w-xl'}`}>
        {back && (
          <Link to={back} className="link mb-4 hidden self-start text-base lg:inline">
            ← Back
          </Link>
        )}
        {children}
      </main>
    </div>
  );
}

/** One number on a dashboard: label, big value, a short hint. */
export function StatTile({ label, value, hint, tone = 'ink', to }: { label: string; value: ReactNode; hint?: string; tone?: 'ink' | 'accent' | 'ok' | 'warn' | 'bad'; to?: string }) {
  const color = { ink: 'text-ink', accent: 'text-accent', ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' }[tone];
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-faint">{hint}</p>}
    </>
  );
  const cls = 'block rounded-2xl border border-rule bg-panel p-4';
  return to ? (
    <Link to={to} className={`${cls} hover:border-accent/40`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A section heading with an optional action on the right. */
export function SectionHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-muted">{title}</h2>
      {children}
    </div>
  );
}

/** Empty state: one line of text and an optional action. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-rule px-4 py-6 text-center text-sm text-faint">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
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
