import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Classroom, Connection, InboxItem, LibraryDocument, RequestStatus, RequestSummary } from '@plc/shared';
import { Empty, Page, SectionHead, StatTile, StatusPill, toast } from '../components/ui';
import { useSession } from '../lib/session';
import { DocumentLibrary } from '../components/DocumentLibrary';
import { ago, fmtDate, useLive } from '../lib/hooks';

type Filter = 'all' | 'active' | 'action' | 'sealed' | 'closed';
const GROUP: Record<RequestStatus, Exclude<Filter, 'all'>> = {
  in_review: 'active', approved: 'active', sealing: 'active', amending: 'active',
  returned: 'action', sealed: 'sealed', rejected: 'closed', revoked: 'closed',
};
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'In progress' },
  { key: 'action', label: 'Needs action' },
  { key: 'sealed', label: 'Signed' },
  { key: 'closed', label: 'Closed' },
];

/** Student home: actions, numbers, what needs action, my requests, documents. Teachers and classes live in My teachers. */
export default function StudentHome() {
  const nav = useNavigate();
  const { me } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const { data: mine, error } = useLive<RequestSummary[]>('/api/requests/mine');
  const { data: docs, reload: reloadDocs } = useLive<LibraryDocument[]>('/api/documents', 15_000);
  const { data: conns } = useLive<Connection[]>('/api/connections', 15_000);
  const { data: classes } = useLive<Classroom[]>('/api/classrooms', 30_000);
  const { data: toSign } = useLive<InboxItem[]>('/api/inbox', 8000);
  const [selected, setSelected] = useState<string[]>([]);
  const count = (f: Exclude<Filter, 'all'>) => mine?.filter((r) => GROUP[r.status] === f).length ?? 0;
  const needsAction = mine?.filter((r) => r.status === 'returned') ?? [];
  const shown = mine?.filter((r) => filter === 'all' || GROUP[r.status] === filter) ?? [];
  const teachers = conns?.filter((c) => c.status === 'accepted') ?? [];
  const send = (to?: string, docIds = selected) => nav(`/student/send?${new URLSearchParams({ ...(to ? { to } : {}), ...(docIds.length ? { docs: docIds.join(',') } : {}) })}`);

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
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">Hello, {me?.name.split(' ')[0]}</h1>
            <p className="text-sm text-muted">{[me?.title, me?.department].filter(Boolean).join(' · ')}</p>
          </div>

          {/* Central actions */}
          <section className="grid gap-3 sm:grid-cols-2">
            <Link to="/student/new" className="cta">
              New request
            </Link>
            <button className="rounded-xl border-2 border-accent px-8 py-5 text-lg font-semibold text-accent active:scale-[0.98]" onClick={() => send(undefined)}>
              Send a document
            </button>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="In progress" value={mine ? count('active') : '–'} tone="accent" hint="with approvers now" />
            <StatTile label="Needs your action" value={mine ? count('action') : '–'} tone={count('action') ? 'warn' : 'ink'} hint="returned for changes" />
            <StatTile label="Signed" value={mine ? count('sealed') : '–'} tone="ok" hint="approved, PDF ready" />
            <StatTile label="To sign" value={toSign?.length ?? '–'} tone={toSign?.length ? 'warn' : 'ink'} hint="sent to you" to="/inbox" />
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

          {needsAction.length > 0 && (
            <section>
              <SectionHead title="Needs your action" />
              <ul className="flex flex-col gap-2">
                {needsAction.map((r) => (
                  <li key={r.id}>
                    <Link to={`/requests/${r.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-warn/40 bg-warn-bg px-4 py-3">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{r.title}</span>
                        <span className="text-xs text-muted">
                          {r.typeName} · returned {ago(r.updatedAt)} ago
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-accent">Edit and resubmit →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* My requests, filterable */}
          <section>
            <SectionHead title={`My requests${mine?.length ? ` (${mine.length})` : ''}`} />
            {error && <p className="text-sm text-bad">{error}</p>}
            {mine && mine.length === 0 && (
              <Empty
                action={
                  <Link to="/student/new" className="link">
                    Start your first request →
                  </Link>
                }
              >
                No requests yet. Pick a type, fill one form, and it goes to the right people on its own.
              </Empty>
            )}
            {mine && mine.length > 0 && (
              <>
                <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-panel p-1">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${filter === f.key ? 'bg-bg text-ink shadow-sm' : 'text-muted'}`}
                    >
                      {f.label}
                      <span className="ml-1 text-xs text-faint">{f.key === 'all' ? mine.length : count(f.key)}</span>
                    </button>
                  ))}
                </div>
                {shown.length === 0 ? (
                  <Empty>Nothing here.</Empty>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {shown.map((r) => (
                      <li key={r.id}>
                        <Link to={`/requests/${r.id}`} className="block rounded-2xl border border-rule bg-bg p-4 hover:border-accent/40 active:bg-rule">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{r.title}</p>
                              <p className="text-xs text-muted">
                                {r.typeName} · <span className="font-mono">{r.id}</span>
                                {r.version > 1 && ` · v${r.version}`} · {fmtDate(r.createdAt)}
                              </p>
                            </div>
                            <StatusPill status={r.status} />
                          </div>
                          {r.withNow.length > 0 && (
                            <p className="mt-2 text-sm text-muted">
                              With: {r.withNow.map((w) => (w.role === 'recipient' ? w.name : w.roleLabel)).join(' and ')} (since {ago(r.withNow[0].since)})
                            </p>
                          )}
                          {r.status === 'sealed' && <p className="mt-2 text-sm font-semibold text-ok">Signed on chain · open it to download the PDF</p>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          {/* Teachers and classes: summary here, managed in My teachers */}
          <section className="rounded-2xl border border-rule p-4">
            <SectionHead title="My teachers">
              <Link to="/student/teachers" className="link">
                Open →
              </Link>
            </SectionHead>
            <div className="grid grid-cols-2 gap-3">
              <Link to="/student/teachers" className="rounded-xl bg-panel p-3 hover:bg-rule">
                <p className="text-2xl font-bold tabular-nums">{conns ? teachers.length : '–'}</p>
                <p className="text-xs text-muted">Teachers</p>
              </Link>
              <Link to="/student/teachers?tab=classes" className="rounded-xl bg-panel p-3 hover:bg-rule">
                <p className="text-2xl font-bold tabular-nums">{classes?.length ?? '–'}</p>
                <p className="text-xs text-muted">Classes</p>
              </Link>
            </div>
            <Link to="/student/teachers?tab=classes" className="mt-3 block text-center text-sm font-semibold text-accent">
              Got a class code? Join a class →
            </Link>
          </section>

          {/* On phones the documents come last */}
          <div className="lg:hidden">{library}</div>


        </div>
      </div>
    </Page>
  );
}
