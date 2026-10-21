import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { RequestSummary } from '@plc/shared';
import { Page, StatusPill, toast } from '../components/ui';
import { api } from '../lib/api';
import { fmtDate, useLive } from '../lib/hooks';

/** Admin: every request at a glance, plus the demo reset. */
export default function Admin() {
  const { data: all, reload } = useLive<RequestSummary[]>('/api/admin/requests');
  const [busy, setBusy] = useState(false);

  async function reset() {
    if (!confirm('Reset the demo? All requests are deleted and Riya gets a fresh sealed v1.')) return;
    setBusy(true);
    try {
      await api('/api/admin/reset-demo', { method: 'POST' });
      toast('Demo reset: Riya has a sealed v1 again');
      reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page wide>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold md:text-3xl">All requests</h1>
        <button className="rounded-xl border-2 border-ink px-4 py-2 text-sm font-semibold disabled:opacity-40" onClick={reset} disabled={busy}>
          {busy ? 'Resetting…' : 'Reset demo'}
        </button>
      </div>
      {all && all.length === 0 && <p className="text-muted">No requests yet.</p>}
      <ul className="flex flex-col gap-2">
        {all?.map((r) => (
          <li key={r.id}>
            <Link to={`/requests/${r.id}`} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-rule p-4 hover:border-accent/40 md:grid-cols-[10rem_1fr_12rem_auto]">
              <span className="hidden font-mono text-xs text-faint md:block">{r.id}</span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{r.title}</span>
                <span className="text-xs text-muted">
                  {r.typeName} · {r.student.name} · v{r.version}
                </span>
              </span>
              <span className="hidden text-xs text-muted md:block">
                {r.withNow.length ? `With ${r.withNow.map((w) => w.roleLabel).join(', ')}` : `Updated ${fmtDate(r.updatedAt)}`}
              </span>
              <StatusPill status={r.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
