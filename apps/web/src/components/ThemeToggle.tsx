import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'plc.theme';

const systemTheme = (): Theme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function current(): Theme {
  const set = document.documentElement.dataset.theme;
  return set === 'light' || set === 'dark' ? set : systemTheme();
}

/** Light / dark switch, remembered on this device. Until someone picks, the device setting decides. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(current);

  useEffect(() => {
    // Follow the device while no choice has been saved.
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => !document.documentElement.dataset.theme && setTheme(systemTheme());
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, []);

  function flip() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage blocked: applies for this visit only */
    }
    setTheme(next);
  }

  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={flip}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full lg:h-9 lg:w-9 border border-rule text-ink transition hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${className}`}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
