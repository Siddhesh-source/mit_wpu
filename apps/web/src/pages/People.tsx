import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Classroom, Connection, InviteResult, Person } from '@plc/shared';
import { PersonBlock } from '../components/PersonBlock';
import { Empty, Page, PageHeader, SectionHead, toast } from '../components/ui';
import { api } from '../lib/api';
import { fmtDate, useLive } from '../lib/hooks';
import { useSession } from '../lib/session';

type Tab = 'classes' | 'students' | 'colleagues';

const field = 'w-full rounded-xl border border-rule px-4 py-2.5 outline-none focus:border-accent';

/** One class: its code, invite by email, members (joined / invited). */
function ClassCard({ c, onChanged }: { c: Classroom; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState('');
  const [results, setResults] = useState<InviteResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const invited = c.members.length;

  async function invite(e: FormEvent) {
    e.preventDefault();
    const list = emails.split(/[\s,;]+/).filter(Boolean);
    if (!list.length) return toast('Add at least one student email');
    setBusy(true);
    try {
      const r = await api<{ results: InviteResult[] }>(`/api/classrooms/${c.id}/invite`, { method: 'POST', json: { emails: list } });
      setResults(r.results);
      const ok = r.results.filter((x) => x.ok).length;
      toast(ok ? `Code emailed to ${ok} student${ok > 1 ? 's' : ''}` : 'No emails sent');
      setEmails(r.results.filter((x) => !x.ok).map((x) => x.email).join('\n'));
      onChanged();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    await api(`/api/classrooms/${c.id}/members/${userId}`, { method: 'DELETE' }).catch((e) => toast(e.message));
    onChanged();
  }
  async function del() {
    if (!confirm(`Delete the class "${c.name}"? Students stay connected to you.`)) return;
    await api(`/api/classrooms/${c.id}`, { method: 'DELETE' }).catch((e) => toast(e.message));
    onChanged();
  }

  return (
    <article className="rounded-2xl border border-rule">
      <button className="flex w-full items-center gap-4 p-4 text-left" onClick={() => setOpen(!open)}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-semibold">{c.name}</span>
          <span className="text-xs text-muted">
            {c.joinedCount} joined · {invited - c.joinedCount} invited · created {fmtDate(c.createdAt)}
          </span>
        </span>
        <span className="rounded-lg bg-panel px-3 py-1.5 font-mono text-lg font-bold tracking-widest">{c.code}</span>
        <span className="text-muted">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="border-t border-rule p-4">
          <form onSubmit={invite} className="mb-5">
            <label className="mb-1 block text-sm font-semibold">Invite students by email</label>
            <p className="mb-2 text-xs text-faint">
              Use the email each student signed up with. The code is sent to that address, and only that student can use it to join.
            </p>
            <textarea rows={3} className={field} placeholder={'aarav@college.edu\nmeera@college.edu'} value={emails} onChange={(e) => setEmails(e.target.value)} />
            <button className="cta mt-2 w-full py-3 text-base" disabled={busy}>
              {busy ? 'Sending…' : 'Email the code'}
            </button>
            {results && results.some((r) => !r.ok) && (
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {results
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={r.email} className="text-bad">
                      {r.email}: {r.error}
                    </li>
                  ))}
              </ul>
            )}
          </form>

          <SectionHead title={`Students (${invited})`} />
          {invited === 0 ? (
            <Empty>No one invited yet.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-rule rounded-xl border border-rule">
              {c.members.map((m) => (
                <li key={m.person.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ok text-xs font-semibold text-white">{m.person.initials}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{m.person.name}</span>
                    <span className="block truncate text-xs text-faint">{m.email}</span>
                  </span>
                  {m.joinedAt ? (
                    <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[11px] font-semibold text-ok">Joined</span>
                  ) : (
                    <span className="rounded-full bg-panel px-2 py-0.5 text-[11px] font-semibold text-muted">Invited</span>
                  )}
                  <button className="text-xs text-faint hover:text-bad" onClick={() => remove(m.person.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="mt-4 text-xs font-semibold text-bad" onClick={del}>
            Delete class
          </button>
        </div>
      )}
    </article>
  );
}

/** Staff: classes (with join codes), connected students, and colleagues, each in its own tab. */
export default function People() {
  const { me } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'classes';
  const { data: classes, reload: reloadClasses } = useLive<Classroom[]>('/api/classrooms', 15_000);
  const { data: conns, reload: reloadConns } = useLive<Connection[]>('/api/connections', 10_000);
  const { data: staff } = useLive<Person[]>(tab === 'colleagues' ? '/api/people?kind=staff' : null, 60_000);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const mine = classes?.filter((c) => c.code) ?? [];
  const students = conns?.filter((c) => c.status === 'accepted') ?? [];
  const asking = conns?.filter((c) => c.status === 'pending') ?? [];
  const colleagues = staff?.filter((p) => p.department === me?.department) ?? [];
  const classesOf = (id: string) => mine.filter((c) => c.members.some((m) => m.person.id === id && m.joinedAt)).map((c) => c.name);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await api<Classroom>('/api/classrooms', { method: 'POST', json: { name } });
      toast(`Class created · code ${c.code}`);
      setName('');
      reloadClasses();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function answer(c: Connection, how: 'accept' | 'decline') {
    await api(`/api/connections/${c.id}/${how}`, { method: 'POST' }).catch((e) => toast(e.message));
    reloadConns();
  }
  async function disconnect(c: Connection) {
    if (!confirm(`Remove ${c.person.name} from your students?`)) return;
    await api(`/api/connections/${c.id}`, { method: 'DELETE' }).catch((e) => toast(e.message));
    reloadConns();
  }

  const TABS: { key: Tab; label: string; n?: number }[] = [
    { key: 'classes', label: 'Classes', n: mine.length },
    { key: 'students', label: 'Students', n: students.length + asking.length },
    { key: 'colleagues', label: 'Colleagues' },
  ];

  return (
    <Page wide>
      <PageHeader title="People" subtitle="Your classes, the students connected to you and your colleagues. Connected students' requests come to you first." />

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-panel p-1 md:w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={`min-h-[40px] whitespace-nowrap rounded-lg px-4 text-sm font-semibold ${tab === t.key ? 'bg-bg text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {t.label}
            {!!t.n && <span className="ml-1 text-xs text-faint">{t.n}</span>}
          </button>
        ))}
      </div>

      {tab === 'classes' && (
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-10">
          <section className="flex flex-col gap-3">
            {classes && mine.length === 0 && <Empty>No classes yet. Create one, then email its code to your students.</Empty>}
            {mine.map((c) => (
              <ClassCard key={c.id} c={c} onChanged={reloadClasses} />
            ))}
          </section>
          <aside className="rounded-2xl border border-rule bg-panel p-4 lg:sticky lg:top-24">
            <SectionHead title="New class" />
            <form onSubmit={create} className="flex flex-col gap-2">
              <input className={field} placeholder="e.g. CSE 2A · Compilers" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="cta py-3 text-base" disabled={busy || !name.trim()}>
                Create class
              </button>
            </form>
            <p className="mt-3 text-xs text-faint">
              You get a 6-letter code. Invite students by the email they signed up with; the code is emailed to them and works only for their account.
            </p>
          </aside>
        </div>
      )}

      {tab === 'students' && (
        <div className="flex flex-col gap-8">
          {asking.length > 0 && (
            <section>
              <SectionHead title={`Want to add you (${asking.length})`} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {asking.map((c) => (
                  <PersonBlock key={c.id} p={c.person}>
                    <button className="flex-1 rounded-xl bg-ok px-4 py-2 text-sm font-semibold text-white" onClick={() => answer(c, 'accept')}>
                      Accept
                    </button>
                    <button className="rounded-xl border border-rule px-4 py-2 text-sm font-semibold" onClick={() => answer(c, 'decline')}>
                      Decline
                    </button>
                  </PersonBlock>
                ))}
              </div>
            </section>
          )}
          <section>
            <SectionHead title={`My students (${students.length})`} />
            {conns && students.length === 0 ? (
              <Empty>Students join when they accept your class code or when you accept their request.</Empty>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {students.map((c) => {
                  const inClasses = classesOf(c.person.id);
                  return (
                    <PersonBlock key={c.id} p={c.person}>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted">{inClasses.length ? inClasses.join(', ') : 'Not in a class'}</span>
                      <button className="text-xs text-faint hover:text-bad" onClick={() => disconnect(c)}>
                        Remove
                      </button>
                    </PersonBlock>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'colleagues' && (
        <section>
          <SectionHead title={`Faculty and staff in ${me?.department ?? 'your department'}${staff ? ` (${colleagues.length})` : ''}`} />
          {staff && colleagues.length === 0 ? (
            <Empty>No colleagues yet.</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {colleagues.map((p) => (
                <PersonBlock key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>
      )}
    </Page>
  );
}
