import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { homeFor, ROLE_LABEL, type Profile } from '@plc/shared';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { PinPad } from '../components/ui';

const LAST = 'plc.lastProfile';

export default function Login() {
  const { me, login } = useSession();
  const nav = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [picked, setPicked] = useState<Profile | null>(null);
  const [reset, setReset] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me) nav(homeFor(me.roles), { replace: true });
  }, [me, nav]);

  useEffect(() => {
    api<Profile[]>('/api/profiles')
      .then(setProfiles)
      .catch((e) => setError(e.message));
  }, []);

  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST);
  } catch {
    /* ignore */
  }
  const ordered = last ? [...profiles].sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : 0)) : profiles;

  async function enter(pin: string) {
    if (busy || !picked) return;
    setBusy(true);
    setError('');
    try {
      const m = await login(picked.id, pin);
      try {
        localStorage.setItem(LAST, picked.id);
      } catch {
        /* ignore */
      }
      nav(homeFor(m.roles), { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-10 md:max-w-3xl md:justify-center md:py-16">
      <header className="mb-8 text-center md:mb-12">
        <h1 className="text-3xl font-bold md:text-5xl">PaperLess Campus</h1>
        <p className="mt-2 text-muted md:text-lg">No queues. No paper. No forged signatures.</p>
      </header>

      {!picked ? (
        <>
          <p className="mb-3 text-sm text-muted">Who's signing in?</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
            {ordered.map((p) => (
              <button
                key={p.id}
                onClick={() => setPicked(p)}
                className="flex flex-col items-center gap-2 rounded-2xl border border-rule bg-panel p-5 text-center transition active:scale-[0.98]"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-lg font-semibold text-white">{p.initials}</span>
                <span className="font-semibold">{p.name}</span>
                <span className="text-xs text-muted">{ROLE_LABEL[p.role]}</span>
              </button>
            ))}
          </div>
          {error && <p className="mt-4 text-center text-sm text-bad">{error}</p>}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-xl font-semibold text-white">{picked.initials}</span>
          <p className="mt-3 text-lg font-semibold">{picked.name}</p>
          <p className="text-sm text-muted">{picked.title}</p>

          <p className="mb-2 mt-6 h-5 text-sm text-bad">{error}</p>
          <PinPad onComplete={enter} busy={busy} reset={reset} />

          <button className="link mt-6" onClick={() => (setPicked(null), setError(''))}>
            Not you? Pick another profile
          </button>
        </div>
      )}
    </main>
  );
}
