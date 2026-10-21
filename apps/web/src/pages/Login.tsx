import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DESIGNATIONS, DESIGNATION_LABEL, ROLE_LABEL, homeFor, type Department } from '@plc/shared';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { ThemeToggle } from '../components/ThemeToggle';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';

type Kind = 'student' | 'staff';
const KIND = 'plc.kind';
const input = 'w-full rounded-xl border border-rule bg-bg px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">
        {label}
        {optional && <span className="font-normal text-faint"> (optional)</span>}
      </span>
      {children}
    </label>
  );
}

/** One page, two choices: Student or Staff / Administrator; each can sign up or log in. */
export default function Login() {
  const { me, login, signup } = useSession();
  const nav = useNavigate();
  const [kind, setKind] = useState<Kind | null>(() => {
    try {
      return (localStorage.getItem(KIND) as Kind | null) ?? null;
    } catch {
      return null;
    }
  });
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [depts, setDepts] = useState<Department[]>([]);
  const [f, setF] = useState<Record<string, string>>({ departmentId: 'cse', designation: 'faculty' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (me) nav(homeFor(me.roles), { replace: true });
  }, [me, nav]);
  useEffect(() => {
    api<Department[]>('/api/departments').then(setDepts).catch(() => undefined);
  }, []);

  function choose(k: Kind) {
    setKind(k);
    setError('');
    try {
      localStorage.setItem(KIND, k);
    } catch {
      /* ignore */
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const m = mode === 'login' ? await login(f.email ?? '', f.password ?? '') : await signup({ ...f, kind: kind! });
      nav(homeFor(m.roles), { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col px-4 py-10 md:max-w-2xl md:justify-center">
      <ThemeToggle className="absolute right-4 top-4" />
      <header className="mb-10 flex flex-col items-center text-center">
        <h1>
          <Logo size="lg" />
        </h1>
        <p className="mt-3 text-muted">No queues. No paper. No forged signatures.</p>
      </header>

      {!kind ? (
        <div className="mx-auto flex w-full max-w-md flex-col gap-3">
          {(
            [
              { k: 'student', icon: 'student', title: "I'm a student", line: 'Request approvals, send documents, track every signature' },
              { k: 'staff', icon: 'building', title: "I'm staff / administrator", line: 'Faculty, HoD, Dean, Security, offices or Registrar' },
            ] as const
          ).map((c) => (
            <button key={c.k} onClick={() => choose(c.k)} className="group flex items-center gap-4 rounded-2xl border border-rule p-4 text-left transition-colors hover:border-accent hover:bg-panel">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/10 text-accent">
                <Icon name={c.icon} className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.title}</span>
                <span className="block text-sm text-muted">{c.line}</span>
              </span>
              <Icon name="chevron" className="h-5 w-5 text-faint transition-colors group-hover:text-accent" />
            </button>
          ))}
        </div>
      ) : (
        <section className="mx-auto w-full max-w-md">
          <button className="link mb-4" onClick={() => setKind(null)}>
            ← {kind === 'student' ? 'Student' : 'Staff / administrator'}
          </button>
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-panel p-1">
            {(['signup', 'login'] as const).map((m) => (
              <button key={m} onClick={() => (setMode(m), setError(''))} className={`rounded-lg py-2 text-sm font-semibold ${mode === m ? 'bg-bg shadow-sm' : 'text-muted'}`}>
                {m === 'signup' ? 'Sign up' : 'Log in'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <Field label="Full name">
                <input className={input} required value={f.name ?? ''} onChange={set('name')} placeholder={kind === 'student' ? 'Riya Patil' : 'Dr. Meera Nair'} autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <input className={input} type="email" required value={f.email ?? ''} onChange={set('email')} autoComplete="email" />
            </Field>
            <Field label="Password">
              <input className={input} type="password" required minLength={mode === 'signup' ? 6 : 1} value={f.password ?? ''} onChange={set('password')} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </Field>

            {mode === 'signup' && (
              <>
                <Field label="Signing PIN (4 digits, used to sign documents)">
                  <input className={`${input} font-mono tracking-[0.5em]`} inputMode="numeric" pattern="\d{4}" maxLength={4} required value={f.pin ?? ''} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} />
                </Field>
                <Field label="Department">
                  <select className={input} value={f.departmentId} onChange={set('departmentId')}>
                    {depts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {kind === 'staff' ? (
                  <>
                    <Field label="Designation">
                      <select className={input} value={f.designation} onChange={set('designation')}>
                        {DESIGNATIONS.map((r) => (
                          <option key={r} value={r}>
                            {DESIGNATION_LABEL[r] ?? ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <details className="rounded-xl border border-rule px-4 py-3">
                      <summary className="cursor-pointer text-sm font-semibold text-accent">More details (optional)</summary>
                      <div className="mt-3 flex flex-col gap-3">
                        <Field label="Title" optional>
                          <input className={input} value={f.title ?? ''} onChange={set('title')} placeholder="Associate Professor" />
                        </Field>
                        <Field label="Employee ID" optional>
                          <input className={input} value={f.employeeId ?? ''} onChange={set('employeeId')} />
                        </Field>
                        <Field label="Phone" optional>
                          <input className={input} type="tel" value={f.phone ?? ''} onChange={set('phone')} />
                        </Field>
                        <Field label="About" optional>
                          <textarea className={input} rows={2} value={f.bio ?? ''} onChange={set('bio')} />
                        </Field>
                      </div>
                    </details>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Roll number" optional>
                      <input className={input} value={f.rollNo ?? ''} onChange={set('rollNo')} />
                    </Field>
                    <Field label="Year" optional>
                      <input className={input} value={f.year ?? ''} onChange={set('year')} placeholder="2nd year" />
                    </Field>
                  </div>
                )}
              </>
            )}

            {error && <p className="text-sm text-bad">{error}</p>}
            <button className="cta mt-2 w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
            </button>
            <button type="button" className="link self-center" onClick={() => (setMode(mode === 'signup' ? 'login' : 'signup'), setError(''))}>
              {mode === 'signup' ? 'Already have an account? Log in' : 'New here? Create an account'}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
