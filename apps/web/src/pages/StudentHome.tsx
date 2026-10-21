import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Connection, InboxItem, LibraryDocument, Person, RequestSummary } from '@plc/shared';
import { Page, StatusPill, toast } from '../components/ui';
import { DocumentLibrary } from '../components/DocumentLibrary';
import { PersonBlock } from '../components/PersonBlock';
import { api } from '../lib/api';
import { ago, useLive } from '../lib/hooks';

/** Student workspace: documents (drag and drop), teachers as blocks, add a teacher, things to sign, my requests. */
export default function StudentHome() {
  const nav = useNavigate();
  const { data: mine, error } = useLive<RequestSummary[]>('/api/requests/mine');
  const { data: docs, reload: reloadDocs } = useLive<LibraryDocument[]>('/api/documents', 15_000);
  const { data: conns, reload: reloadConns } = useLive<Connection[]>('/api/connections', 8000);
  const { data: toSign } = useLive<InboxItem[]>('/api/inbox', 8000);
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Person[] | null>(null);

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
  const send = (to?: string, docIds = selected) => nav(`/student/send?${new URLSearchParams({ ...(to ? { to } : {}), ...(docIds.length ? { docs: docIds.join(',') } : {}) })}`);

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
    await api(`/api/connections/${c.id}`, { method: 'DELETE' }).catch((e) => toast(e.message));
    reloadConns();
  }

  const library = (
    <aside className="lg:sticky lg:top-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">My documents{docs?.length ? ` (${docs.length})` : ''}</h2>
        {selected.length > 0 && (
          <button className="text-xs font-semibold text-muted" onClick={() => setSelected([])}>
            Clear
          </button>
        )}
      </div>
      <DocumentLibrary docs={docs} onChanged={reloadDocs} selected={selected} onSelect={setSelected} />
      <button className="cta mt-3 w-full py-3 text-base" disabled={!selected.length} onClick={() => send(undefined)}>
        Send {selected.length || ''} to…
      </button>
    </aside>
  );

  return (
    <Page wide>
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[18rem_1fr] lg:items-start lg:gap-10">
        <div className="hidden lg:block">{library}</div>

        <div className="flex flex-col gap-8">
          {/* Central actions */}
          <section className="grid gap-3 sm:grid-cols-2">
            <Link to="/student/new" className="cta">
              New request
            </Link>
            <button className="rounded-xl border-2 border-accent px-8 py-5 text-lg font-semibold text-accent active:scale-[0.98]" onClick={() => send(undefined)}>
              Send a document
            </button>
          </section>

          {toSign && toSign.length > 0 && (
            <Link to="/inbox" className="flex items-center justify-between gap-3 rounded-2xl bg-warn-bg px-4 py-3 text-sm">
              <span>
                <b className="text-warn">{toSign.length} waiting for your signature</b> · from {toSign[0].student.name}
                {toSign.length > 1 && ' and others'}
              </span>
              <span className="font-semibold text-accent">Review →</span>
            </Link>
          )}

          {/* Teachers as blocks */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted">My teachers</h2>
            {teachers.length === 0 && pending.length === 0 && <p className="mb-2 text-sm text-faint">Add your teachers below to send them documents in one tap.</p>}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {teachers.map((c) => (
                <PersonBlock key={c.id} p={c.person}>
                  <button className="flex-1 whitespace-nowrap rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.98]" onClick={() => send(c.person.id)}>
                    Send document
                  </button>
                  <button className="px-2 text-xs text-faint hover:text-bad" onClick={() => remove(c)} title="Remove">
                    Remove
                  </button>
                </PersonBlock>
              ))}
              {pending.map((c) => (
                <PersonBlock key={c.id} p={c.person} muted>
                  <span className="text-xs font-semibold text-warn">Waiting for {c.person.name.split(' ').slice(-1)[0]} to accept</span>
                  <button className="ml-auto text-xs text-faint" onClick={() => send(c.person.id)}>
                    Send anyway
                  </button>
                </PersonBlock>
              ))}
            </div>
          </section>

          {/* On phones the documents sit right after the teachers */}
          <div className="lg:hidden">{library}</div>

          {/* Add a teacher */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted">Add a teacher</h2>
            <input
              className="mb-3 w-full rounded-xl border border-rule px-4 py-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Search by name, designation or department"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {found?.slice(0, 9).map((p) => {
                const st = statusOf(p.id);
                return (
                  <PersonBlock key={p.id} p={p}>
                    {st === 'accepted' ? (
                      <span className="text-xs font-semibold text-ok">✓ Your teacher</span>
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
            {!found && <p className="text-xs text-faint">Type a name (e.g. “Meera”), a designation (“HoD”) or a department.</p>}
          </section>

          {/* My requests */}
          {error && <p className="text-sm text-bad">{error}</p>}
          {mine && mine.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">My requests</h2>
              <ul className="flex flex-col gap-2">
                {mine.map((r) => (
                  <li key={r.id}>
                    <Link to={`/requests/${r.id}`} className="block rounded-2xl border border-rule bg-bg p-4 hover:border-accent/40 active:bg-rule">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{r.title}</p>
                          <p className="text-xs text-muted">{r.typeName}</p>
                        </div>
                        <StatusPill status={r.status} />
                      </div>
                      {r.withNow.length > 0 && (
                        <p className="mt-2 text-sm text-muted">
                          With: {r.withNow.map((w) => (w.role === 'recipient' ? w.name : w.roleLabel)).join(' and ')} (since {ago(r.withNow[0].since)})
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </Page>
  );
}
