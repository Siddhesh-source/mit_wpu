import type { Decision, TimelineStep } from '@plc/shared';
import { Cross, Tick } from './ui';
import { ago, fmtDate } from '../lib/hooks';

function Dot({ d }: { d: Decision }) {
  const base = 'grid h-8 w-8 shrink-0 place-items-center rounded-full';
  if (d === 'approved') return <span className={`${base} bg-ok text-white`}><Tick className="h-4 w-4" /></span>;
  if (d === 'carried') return <span className={`${base} border-2 border-ok text-ok`}><Tick className="h-4 w-4" /></span>;
  if (d === 'rejected') return <span className={`${base} bg-bad text-white`}><Cross className="h-4 w-4" /></span>;
  if (d === 'returned') return <span className={`${base} bg-warn text-white font-bold`}>↩</span>;
  if (d === 'pending') return <span className={`${base} border-[3px] border-accent bg-bg`} />;
  return <span className={`${base} border-2 border-rule bg-bg`} />; // waiting / cancelled
}

const NOTE: Record<Decision, (s: TimelineStep) => string> = {
  waiting: () => 'Waiting for earlier step',
  pending: (s) => `Has it now · since ${ago(s.openedAt)}`,
  approved: (s) => `Approved · ${fmtDate(s.signedAt)}`,
  rejected: (s) => `Rejected · ${fmtDate(s.signedAt)}`,
  returned: (s) => `Returned · ${fmtDate(s.signedAt)}`,
  cancelled: () => 'Stopped',
  carried: (s) => (s.carriedFromVersion === s.version ? 'Approved before the changes · still valid' : `Carried from v${s.carriedFromVersion ?? s.version - 1}`),
};

/** Vertical role chain (deck slide 7). Steps that share a stepNo sit side by side as parallel. */
export function Timeline({ steps, done }: { steps: TimelineStep[]; done?: false | 'approved' | 'sealed' }) {
  const groups = [...new Set(steps.map((s) => s.stepNo))].map((n) => steps.filter((s) => s.stepNo === n));
  return (
    <ol className="relative">
      <span className="absolute bottom-4 left-4 top-4 w-0.5 -translate-x-1/2 bg-rule" aria-hidden />
      {groups.map((g) => (
        <li key={g[0].stepNo} className="relative mb-5 flex flex-wrap gap-x-6 gap-y-3">
          {g.length > 1 && <span className="absolute -top-3 left-11 text-[11px] uppercase tracking-wide text-faint">In parallel</span>}
          {g.map((s) => (
            <div key={s.approvalId} className="flex min-w-[9rem] flex-1 items-start gap-3">
              <Dot d={s.decision} />
              <div className="min-w-0">
                <p className={`font-semibold ${s.decision === 'cancelled' ? 'text-faint' : ''}`}>{s.roleLabel}</p>
                <p className="text-sm text-muted">
                  {s.assignee.name}
                  {s.onBehalfOf && <span className="text-faint"> for {s.onBehalfOf.name}</span>}
                </p>
                {(s.overdue || s.escalated) && (
                  <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.escalated ? 'bg-bad-bg text-bad' : 'bg-warn-bg text-warn'}`}>
                    {s.escalated ? 'Escalated' : 'Reminder sent'}
                  </span>
                )}
                <p className="text-xs text-faint">{NOTE[s.decision](s)}</p>
                {s.comment && <p className="mt-1 rounded-lg bg-panel px-2 py-1 text-sm">“{s.comment}”</p>}
              </div>
            </div>
          ))}
        </li>
      ))}
      {done && (
        <li className="relative flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ok text-white"><Tick className="h-4 w-4" /></span>
          <p className="font-semibold text-ok">{done === 'sealed' ? 'Approved and signed' : 'Approved'}</p>
        </li>
      )}
    </ol>
  );
}
