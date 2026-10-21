import { useMemo, useState } from 'react';
import type { DecisionEntry, StaffDashboard } from '@plc/shared';
import { DecisionList, DECISION_LABEL } from '../components/Decisions';
import { Empty, Page, PageHeader } from '../components/ui';
import { Icon } from '../components/Icon';
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
      {/* The filter tabs carry the counts; no separate stat cards repeating them. */}
      <PageHeader title="My decisions" subtitle={d ? `${d.total} signed · ${d.thisWeek} this week · newest first` : 'Everything you signed, newest first'}>
        <button className="min-h-[44px] rounded-xl border border-rule px-4 text-sm font-semibold transition-colors hover:bg-panel disabled:opacity-40" disabled={!rows.length} onClick={() => exportCsv(rows)}>
          Export CSV
        </button>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-panel p-1" role="tablist">
          {chips.map((c) => (
            <button
              key={c.key}
              role="tab"
              aria-selected={filter === c.key}
              onClick={() => setFilter(c.key)}
              className={`min-h-[40px] whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${filter === c.key ? 'bg-bg text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {c.label}
              {c.n !== undefined && <span className="ml-1.5 text-xs tabular-nums text-faint">{c.n}</span>}
            </button>
          ))}
        </div>
        <label className="relative block md:w-72">
          <span className="sr-only">Search</span>
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            className="w-full rounded-xl border border-rule py-2.5 pl-10 pr-4 outline-none focus:border-accent"
            placeholder="Title, student or request ID"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}
      {data &&
        (rows.length ? (
          <DecisionList items={rows} />
        ) : (
          <Empty icon="history">{data.history.length ? 'Nothing matches this filter.' : 'You have not signed anything yet. Your approvals, returns and rejections will be listed here.'}</Empty>
        ))}
    </Page>
  );
}
