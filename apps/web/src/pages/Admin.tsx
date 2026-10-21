import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_LABEL, type AuditEntry, type OutboxEntry, type RequestSummary, type Role, type Stats } from '@plc/shared';
import { Page, StatusPill, toast } from '../components/ui';
import { ImpactDashboard } from '../components/ImpactDashboard';
import { api } from '../lib/api';
import { fmtDate, useLive } from '../lib/hooks';

type Tab = 'requests' | 'impact' | 'audit' | 'emails';
const TABS: { key: Tab; label: string }[] = [
  { key: 'requests', label: 'Requests' },
  { key: 'impact', label: 'Impact' },
  { key: 'audit', label: 'Audit log' },
  { key: 'emails', label: 'Emails' },
];

const ACTION: Record<string, string> = {
  submitted: 'Submitted', resubmitted: 'Resubmitted', approved: 'Approved', rejected: 'Rejected', returned: 'Returned',
  fully_approved: 'Fully approved', sealed: 'PDF sealed', anchored: 'Anchored on chain', amendment_requested: 'Amendment requested',
  amendment_returned: 'Amendment returned', amendment_rejected: 'Amendment rejected', revoked: 'Revoked', revocation_anchored: 'Revocation on chain',
  reopened: 'Reopened', commented: 'Comment', sla_nudge: 'Deadline reminder', sla_escalated: 'Escalated', delegation_created: 'Delegate set', delegation_ended: 'Delegation ended',
};

/** One audit detail value, readable: role keys → labels, long hashes shortened. */
const detail = (v: unknown): string => {
  if (Array.isArray(v)) return v.map(detail).join(', ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  if (s in ROLE_LABEL) return ROLE_LABEL[s as Role];
  if (/^(0x)?[0-9a-f]{24,}$/i.test(s)) return `${s.slice(0, s.startsWith('0x') ? 12 : 10)}…`;
  return s.slice(0, 70);
};

/** Admin: every request, impact, the audit trail and the email outbox. */
export default function Admin() {
  const [tab, setTab] = useState<Tab>('requests');
  const { data: all, reload } = useLive<RequestSummary[]>(tab === 'requests' ? '/api/admin/requests' : null);
  const { data: stats } = useLive<Stats>(tab === 'impact' ? '/api/admin/stats' : null, 10_000);
  const { data: log } = useLive<AuditEntry[]>(tab === 'audit' ? '/api/admin/audit?limit=300' : null, 8000);
  const { data: mails } = useLive<OutboxEntry[]>(tab === 'emails' ? '/api/admin/emails' : null, 5000);
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

  async function runSla() {
    const r = await api<{ nudged: number; escalated: number }>('/api/admin/run-sla', { method: 'POST' }).catch((e) => (toast(e.message), null));
    if (r) toast(`Deadline check: ${r.nudged} reminded, ${r.escalated} escalated`);
  }

  return (
    <Page wide>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-panel p-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t.key ? 'bg-bg text-ink shadow-sm' : 'text-muted'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="rounded-xl border border-rule px-3 py-2 text-sm font-semibold" onClick={runSla}>
            Run deadline check
          </button>
          <button className="rounded-xl border-2 border-ink px-3 py-2 text-sm font-semibold disabled:opacity-40" onClick={reset} disabled={busy}>
            {busy ? 'Resetting…' : 'Reset demo'}
          </button>
        </div>
      </div>

      {tab === 'requests' && (
        <>
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
        </>
      )}

      {tab === 'impact' && stats && <ImpactDashboard s={stats} />}

      {tab === 'audit' && (
        <div className="overflow-x-auto rounded-2xl border border-rule">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-panel text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-normal">When</th>
                <th className="px-3 py-2 font-normal">Request</th>
                <th className="px-3 py-2 font-normal">Who</th>
                <th className="px-3 py-2 font-normal">What</th>
                <th className="px-3 py-2 font-normal">Details</th>
              </tr>
            </thead>
            <tbody>
              {log?.map((e) => (
                <tr key={e.id} className="border-t border-rule align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtDate(e.at)}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {e.requestId ? <Link to={`/requests/${e.requestId}`} className="link text-xs">{e.requestId}</Link> : '—'}
                    {e.version ? ` · v${e.version}` : ''}
                  </td>
                  <td className="px-3 py-2">{e.actor ?? <span className="text-faint">System</span>}</td>
                  <td className="px-3 py-2 font-semibold">{ACTION[e.action] ?? e.action}</td>
                  <td className="max-w-xs px-3 py-2 text-xs text-muted">
                    {Object.entries(e.details)
                      .filter(([, v]) => v !== null && v !== undefined && v !== '')
                      .map(([k, v]) => `${k}: ${detail(v)}`)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'emails' && (
        <>
          <p className="mb-3 text-sm text-muted">Notifications the system sent (or logged, when no email service is configured). See docs/EMAIL_SES.md to send real emails with AWS SES.</p>
          <ul className="flex flex-col gap-2">
            {mails?.length === 0 && <li className="text-faint">No emails yet.</li>}
            {mails?.map((m) => (
              <li key={m.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-2xl border border-rule p-3 text-sm md:grid-cols-[12rem_1fr_auto]">
                <span className="hidden truncate text-xs text-muted md:block">{m.to}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{m.subject}</span>
                  <span className="text-xs text-faint">
                    {fmtDate(m.createdAt)} · {m.kind.replace(/_/g, ' ')}
                  </span>
                </span>
                <span className={`self-center rounded-full px-2 py-0.5 text-xs font-semibold ${m.status === 'failed' ? 'bg-bad-bg text-bad' : m.status === 'pending' ? 'bg-panel text-accent' : 'bg-ok-bg text-ok'}`}>
                  {m.status}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  );
}
