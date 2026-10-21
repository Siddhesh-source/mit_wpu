import { useMemo, useState } from 'react';
import type { DecisionEntry, StaffDashboard } from '@plc/shared';
import { DecisionList, DECISION_LABEL } from '../components/Decisions';
import { Empty, Page, StatTile } from '../components/ui';
import { useLive } from '../lib/hooks';

type Filter = 'all' | DecisionEntry['decision'];

/** Spreadsheet-friendly copy of the filtered history. */
function exportCsv(rows: DecisionEntry[]) {
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Signed at', 'Request', 'Title', 'Type', 'Student', 'Signed as', 'On behalf of', 'Decision', 'Comment', 'Version', 'Status now'];
  const lines = rows.map((h) => [h.signedAt, h.requestId, h.title, h.typeName, h.student.name, h.roleLabel, h.onBehalfOf, DECISION_LABEL[h.decision], h.comment, h.version, h.status].map(cell).join(','));
  const url = URL.createObjectURL(new Blob([[head.map(cell).join(','), ...lines].join('\n')], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `my-decisions-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Staff: every request I approved, returned or rejected, with filters, search and export. */
export default function History() {
  const { data, error } = useLive<StaffDashboard>('/api/dashboard?limit=500', 20_000);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.history ?? []).filter(
      (h) =>
        (filter === 'all' || h.decision === filter) &&
        (!needle || [h.title, h.requestId, h.student.name, h.typeName, h.comment ?? ''].some((v) => v.toLowerCase().includes(needle))),
    );
  }, [data, filter, q]);

  const d = data?.decided;
  const chips: { key: Filter; label: string; n?: number }[] = [
    { key: 'all', label: 'All', n: d?.total },
    { key: 'approved', label: 'Approved', n: d?.approved },
    { key: 'returned', label: 'Returned', n: d?.returned },
    { key: 'rejected', label: 'Rejected', n: d?.rejected },
  ];

  return (
    <Page wide>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">My decisions</h1>
          <p className="text-sm text-muted">Everything you signed, newest first. Open one to see its full approval chain and discussion.</p>
        </div>
        <button className="rounded-xl border border-rule px-4 py-2 text-sm font-semibold disabled:opacity-40" disabled={!rows.length} onClick={() => exportCsv(rows)}>
          Export CSV
        </button>
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Signed" value={d?.total ?? '–'} hint={d ? `${d.thisWeek} this week` : undefined} />
        <StatTile label="Approved" value={d?.approved ?? '–'} tone="ok" />
        <StatTile label="Returned" value={d?.returned ?? '–'} tone="warn" />
        <StatTile label="Rejected" value={d?.rejected ?? '–'} tone="bad" />
      </section>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-panel p-1">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${filter === c.key ? 'bg-bg text-ink shadow-sm' : 'text-muted'}`}
            >
              {c.label}
              {c.n !== undefined && <span className="ml-1 text-xs text-faint">{c.n}</span>}
            </button>
          ))}
        </div>
        <input
          className="w-full rounded-xl border border-rule px-4 py-2.5 outline-none focus:border-accent md:w-72"
          placeholder="Search title, student, request ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}
      {data && (rows.length ? <DecisionList items={rows} /> : <Empty>{data.history.length ? 'Nothing matches this filter.' : 'You have not signed anything yet. Your approvals, returns and rejections will be listed here.'}</Empty>)}
    </Page>
  );
}
