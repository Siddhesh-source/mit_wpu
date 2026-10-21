import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Classroom, Connection, InboxItem, LibraryDocument, RequestStatus, RequestSummary } from '@plc/shared';
import { Empty, Page, PageHeader, SectionHead, StatusPill } from '../components/ui';
import { Icon } from '../components/Icon';
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
    <aside className="lg:sticky lg:top-24">
      <SectionHead title={`My documents${docs?.length ? ` (${docs.length})` : ''}`}>
        {selected.length > 0 && (
          <button className="text-xs font-semibold text-muted hover:text-ink" onClick={() => setSelected([])}>
            Clear
          </button>
        )}
      </SectionHead>
      <DocumentLibrary docs={docs} onChanged={reloadDocs} selected={selected} onSelect={setSelected} />
      {/* Only when there is something to send: no dead button */}
      {selected.length > 0 && (
        <button className="cta mt-3 w-full py-3 text-base" onClick={() => send(undefined)}>
          <Icon name="send" className="mr-2 h-4 w-4" /> Send {selected.length} to…
        </button>
      )}
    </aside>
  );

  return (
    <Page wide>
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[18rem_1fr] lg:items-start lg:gap-10">
        <div className="hidden lg:block">{library}</div>

        <div className="flex flex-col gap-8">
          {/* One filled CTA (New request); Send a document is the secondary action beside it */}
          <div className="-mb-8">
            <PageHeader title={`Hello, ${me?.name.split(' ')[0] ?? ''}`} subtitle={[me?.title, me?.department].filter(Boolean).join(' · ')}>
              <div className="flex w-full gap-2 sm:w-auto">
                <button className="flex min-h-[48px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-rule px-3 text-sm font-semibold transition-colors hover:bg-panel sm:flex-none sm:px-4 sm:text-base" onClick={() => send(undefined)}>
                  <Icon name="send" className="h-4 w-4" /> Send a document
                </button>
                <Link to="/student/new" className="flex min-h-[48px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] sm:flex-none sm:px-5 sm:text-base">
                  <Icon name="plus" className="h-4 w-4" /> New request
                </Link>
              </div>
            </PageHeader>
          </div>


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
                icon="file"
                action={
                  <Link to="/student/new" className="link font-semibold">
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
                      className={`min-h-[40px] whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${filter === f.key ? 'bg-bg text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
                    >
                      {f.label}
                      <span className="ml-1.5 text-xs tabular-nums text-faint">{f.key === 'all' ? mine.length : count(f.key)}</span>
                    </button>
                  ))}
                </div>
                {shown.length === 0 ? (
                  <Empty>Nothing here.</Empty>
                ) : (
                  <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-2xl border border-rule">
                    {shown.map((r) => (
                      <li key={r.id}>
                        <Link to={`/requests/${r.id}`} className="block p-4 transition-colors hover:bg-panel">
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
          <section>
            <SectionHead title="My teachers" />
            <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule text-sm">
              {[
                { to: '/student/teachers', label: 'Teachers', n: conns ? teachers.length : undefined },
                { to: '/student/teachers?tab=classes', label: 'Classes', n: classes?.length },
              ].map((r) => (
                <li key={r.label}>
                  <Link to={r.to} className="flex min-h-[52px] items-center justify-between px-4 transition-colors hover:bg-panel">
                    <span>{r.label}</span>
                    <span className="flex items-center gap-1 font-semibold tabular-nums">
                      {r.n ?? '–'}
                      <Icon name="chevron" className="h-4 w-4 text-faint" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link to="/student/teachers?tab=classes" className="link mt-1 inline-flex min-h-[44px] items-center gap-1.5 font-semibold">
              <Icon name="plus" className="h-4 w-4" /> Join a class with a code
            </Link>
          </section>

          {/* On phones the documents come last */}
          <div className="lg:hidden">{library}</div>


        </div>
      </div>
    </Page>
  );
}
