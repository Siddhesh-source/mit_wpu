import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Classroom, Connection, Person } from '@plc/shared';
import { PersonBlock } from '../components/PersonBlock';
import { Empty, Page, SectionHead, toast } from '../components/ui';
import { api } from '../lib/api';
import { fmtDate, useLive } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Icon } from '../components/Icon';

type Tab = 'teachers' | 'classes';

/** Student: my teachers (connected, waiting, add one) and my classes (join with the emailed code), in tabs. */
export default function MyTeachers() {
  const nav = useNavigate();
  const { me } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'teachers';
  const { data: conns, reload: reloadConns } = useLive<Connection[]>('/api/connections', 8000);
  const { data: classes, reload: reloadClasses } = useLive<Classroom[]>('/api/classrooms', 15_000);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Person[] | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!q.trim()) return setFound(null); // results appear as you type
    const t = setTimeout(() => {
      api<Person[]>(`/api/people?kind=staff&q=${encodeURIComponent(q)}`).then(setFound).catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const teachers = conns?.filter((c) => c.status === 'accepted') ?? [];
  const pending = conns?.filter((c) => c.status === 'pending') ?? [];
  const statusOf = (id: string) => conns?.find((c) => c.person.id === id)?.status;
  const classesOf = (id: string) => classes?.filter((c) => c.teacher.id === id).map((c) => c.name) ?? [];
  const send = (to: string) => nav(`/student/send?to=${encodeURIComponent(to)}`);

  async function connect(p: Person) {
    try {
      await api('/api/connections', { method: 'POST', json: { staffId: p.id } });
      toast(`Request sent to ${p.name}`);
      reloadConns();
    } catch (e) {
      toast((e as Error).message);
    }
  }
  async function remove(c: Connection) {
    if (!confirm(`Remove ${c.person.name} from your teachers?`)) return;
    await api(`/api/connections/${c.id}`, { method: 'DELETE' }).catch((e) => toast(e.message));
    reloadConns();
  }
  async function join(e: FormEvent) {
    e.preventDefault();
    setJoining(true);
    try {
      const c = await api<Classroom>('/api/classrooms/join', { method: 'POST', json: { code } });
      toast(`You joined ${c.name}. ${c.teacher.name} is now one of your teachers.`);
      setCode('');
      reloadClasses();
      reloadConns();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setJoining(false);
    }
  }

  const TABS: { key: Tab; label: string; n?: number }[] = [
    { key: 'teachers', label: 'Teachers', n: teachers.length + pending.length },
    { key: 'classes', label: 'Classes', n: classes?.length },
  ];

  return (
    <Page wide>
      <div className="mb-6">
        <h1 className="text-2xl font-bold md:text-3xl">My teachers</h1>
        <p className="text-sm text-muted">Your teachers and classes. Your requests go to your own teachers first, and you can send them documents in one tap.</p>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-panel p-1 md:w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={`whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === t.key ? 'bg-bg text-ink shadow-sm' : 'text-muted'}`}
          >
            {t.label}
            {!!t.n && <span className="ml-1 text-xs text-faint">{t.n}</span>}
          </button>
        ))}
      </div>

      {tab === 'teachers' && (
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-10">
          <section>
            <SectionHead title={`Connected (${teachers.length})`} />
            {conns && teachers.length === 0 && pending.length === 0 ? (
              <Empty>No teachers yet. Join a class with the code your teacher emailed you, or search for a teacher and add them.</Empty>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {teachers.map((c) => {
                  const inClasses = classesOf(c.person.id);
                  return (
                    <PersonBlock key={c.id} p={c.person}>
                      {inClasses.length > 0 && <span className="w-full truncate text-xs text-muted">{inClasses.join(', ')}</span>}
                      <button className="flex-1 whitespace-nowrap rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.98]" onClick={() => send(c.person.id)}>
                        Send document
                      </button>
                      <button className="px-2 text-xs text-faint hover:text-bad" onClick={() => remove(c)}>
                        Remove
                      </button>
                    </PersonBlock>
                  );
                })}
                {pending.map((c) => (
                  <PersonBlock key={c.id} p={c.person} muted>
                    <span className="text-xs font-semibold text-warn">Waiting for {c.person.name.split(' ').slice(-1)[0]} to accept</span>
                    <button className="ml-auto text-xs text-faint" onClick={() => send(c.person.id)}>
                      Send anyway
                    </button>
                  </PersonBlock>
                ))}
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-rule bg-panel p-4 lg:sticky lg:top-24">
            <SectionHead title="Add a teacher" />
            <input
              className="mb-3 w-full rounded-xl border border-rule px-4 py-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Search by name, designation or department"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="flex flex-col gap-3">
              {found?.slice(0, 8).map((p) => {
                const st = statusOf(p.id);
                return (
                  <PersonBlock key={p.id} p={p}>
                    {st === 'accepted' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok"><Icon name="check" className="h-4 w-4" /> Your teacher</span>
                    ) : st === 'pending' ? (
                      <span className="text-xs font-semibold text-warn">Requested</span>
                    ) : (
                      <button className="rounded-xl border-2 border-accent px-4 py-2 text-sm font-semibold text-accent" onClick={() => connect(p)}>
                        + Add
                      </button>
                    )}
                    <button className="ml-auto text-xs font-semibold text-accent" onClick={() => send(p.id)}>
                      Send document
                    </button>
                  </PersonBlock>
                );
              })}
            </div>
            {found && found.length === 0 && <p className="text-sm text-faint">Nobody matches “{q}”.</p>}
            {!found && <p className="text-xs text-faint">Type a name (e.g. “Meera”), a designation (“HoD”) or a department. They accept, then appear here.</p>}
          </aside>
        </div>
      )}

      {tab === 'classes' && (
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-10">
          <section>
            <SectionHead title={`My classes (${classes?.length ?? 0})`} />
            {classes && classes.length === 0 ? (
              <Empty>You have not joined a class yet.</Empty>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {classes?.map((c) => (
                  <article key={c.id} className="rounded-2xl border border-rule p-4">
                    <p className="truncate text-lg font-semibold">{c.name}</p>
                    <p className="truncate text-xs text-muted">
                      {c.teacher.name} · {c.joinedCount} student{c.joinedCount === 1 ? '' : 's'} · since {fmtDate(c.createdAt)}
                    </p>
                    <button className="mt-3 text-sm font-semibold text-accent" onClick={() => send(c.teacher.id)}>
                      Send a document to {c.teacher.name.split(' ').slice(-1)[0]} →
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-rule bg-panel p-4 lg:sticky lg:top-24">
            <SectionHead title="Join a class" />
            <form onSubmit={join} className="flex flex-col gap-2">
              <input
                className="w-full rounded-xl border border-rule px-4 py-3 text-center font-mono text-xl uppercase tracking-[0.4em] outline-none placeholder:font-sans placeholder:text-base placeholder:normal-case placeholder:tracking-normal focus:border-accent"
                placeholder="6-letter code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
              <button className="cta py-3 text-base" disabled={code.length !== 6 || joining}>
                {joining ? 'Joining…' : 'Join class'}
              </button>
            </form>
            <p className="mt-3 text-xs text-faint">
              Your teacher emails the code to the address you signed up with{me?.email ? ` (${me.email})` : ''}. It only works for your account.
            </p>
          </aside>
        </div>
      )}
    </Page>
  );
}
