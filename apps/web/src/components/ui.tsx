import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { APPROVER_ROLES, ROLE_LABEL, STATUS_LABEL, type InboxItem, type RequestStatus, type Role } from '@plc/shared';
import { useSession } from '../lib/session';
import { useLive } from '../lib/hooks';
import { ThemeToggle } from './ThemeToggle';
import { Icon, type IconName } from './Icon';
import { Logo } from './Logo';

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

type NavItem = { to: string; label: string; icon: IconName; badge?: number; end?: boolean };

/** Top bar destinations for this person's roles. `waiting` = items waiting for their signature. */
function navFor(roles: Role[], waiting: number): NavItem[] {
  if (roles.includes('student'))
    return [
      { to: '/student', label: 'Home', icon: 'home', end: true },
      { to: '/student/new', label: 'New request', icon: 'plus' },
      { to: '/student/teachers', label: 'My teachers', icon: 'users' },
      { to: '/inbox', label: 'To sign', icon: 'pen', badge: waiting },
      { to: '/verify', label: 'Verify', icon: 'shield' },
    ];
  const items: NavItem[] = [];
  if (roles.includes('security')) items.push({ to: '/gate', label: 'Gate', icon: 'scan' });
  if (roles.some((r) => APPROVER_ROLES.includes(r)))
    items.push(
      { to: '/inbox', label: 'Dashboard', icon: 'inbox', badge: waiting },
      { to: '/people', label: 'People', icon: 'users' },
      { to: '/history', label: 'History', icon: 'history' },
    );
  if (roles.includes('admin')) items.push({ to: '/admin', label: 'Admin', icon: 'building' });
  items.push({ to: '/verify', label: 'Verify', icon: 'shield' });
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
            `flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors lg:min-h-[36px] ${
              isActive ? 'bg-panel text-ink' : 'text-muted hover:bg-panel/60 hover:text-ink'
            }`
          }
        >
          <Icon name={i.icon} className="h-4 w-4" />
          {i.label}
          {!!i.badge && <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold leading-5 text-white tabular-nums">{i.badge}</span>}
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
            <Link to="/" className="shrink-0" aria-label="CampusSign home">
              <Logo />
            </Link>
            {back && (
              <Link to={back} className="link -ml-2 shrink-0 text-base lg:hidden">
                ← Back
              </Link>
            )}
            <TopNav items={items} className="hidden lg:flex" />
          </div>
          <div className="flex min-w-0 items-center gap-3 md:gap-5">
            <div className="hidden min-w-0 max-w-[14rem] sm:block">{who}</div>
            {/* Phones: the profile is one tap on your initials */}
            <Link to="/profile" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-panel text-sm font-semibold sm:hidden" title="Your profile" aria-label="Your profile">
              {me?.initials}
            </Link>
            <ThemeToggle />
            <button className="link min-h-[44px] shrink-0" onClick={() => (logout(), nav('/login'))}>
              Log out
            </button>
          </div>
        </div>
        {items.length > 0 && (
          // Phones and tablets: the destinations scroll in a row; the right edge fades so the scroll is visible.
          <div className="relative mx-auto max-w-6xl lg:hidden">
            <div className="overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
              <TopNav items={items} />
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg" />
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

/** Page title, one-line subtitle and an optional action on the right. */
export function PageHeader({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** A section heading (more space above than below; callers' gap-8 provides the space above) with an optional action. */
export function SectionHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-[28px] items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

/** Empty state: a quiet panel with an optional icon, one line of text and an optional action. Dashed borders are for drop zones only. */
export function Empty({ children, action, icon }: { children: ReactNode; action?: ReactNode; icon?: IconName }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-panel px-4 py-7 text-center text-sm text-muted">
      {icon && <Icon name={icon} className="mb-2 h-6 w-6 text-faint" />}
      <p className="max-w-sm">{children}</p>
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
