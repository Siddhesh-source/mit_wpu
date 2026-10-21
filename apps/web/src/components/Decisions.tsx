import { Link } from 'react-router-dom';
import type { DecisionEntry } from '@plc/shared';
import { StatusPill } from './ui';
import { fmtDate } from '../lib/hooks';

export const DECISION_LABEL: Record<DecisionEntry['decision'], string> = { approved: 'Approved', returned: 'Returned', rejected: 'Rejected' };
const TONE: Record<DecisionEntry['decision'], string> = { approved: 'bg-ok-bg text-ok', returned: 'bg-warn-bg text-warn', rejected: 'bg-bad-bg text-bad' };

export function DecisionPill({ d }: { d: DecisionEntry['decision'] }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[d]}`}>{DECISION_LABEL[d]}</span>;
}

/** Decisions I signed: what, for whom, my decision and where the request stands now. Each row opens the request. */
export function DecisionList({ items }: { items: DecisionEntry[] }) {
  return (
    <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-2xl border border-rule">
      {items.map((h) => (
        <li key={h.approvalId}>
          <Link to={`/requests/${h.requestId}`} className="grid gap-x-4 gap-y-1 px-4 py-3 hover:bg-panel md:grid-cols-[1fr_auto] md:items-center">
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <DecisionPill d={h.decision} />
                <span className="truncate font-semibold">{h.title}</span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {h.typeName} · {h.student.name} · as {h.roleLabel}
                {h.onBehalfOf && ` for ${h.onBehalfOf}`}
                {h.version > 1 && ` · v${h.version}`}
              </span>
              {h.comment && <span className="mt-0.5 block truncate text-xs italic text-faint">“{h.comment}”</span>}
            </span>
            <span className="flex items-center gap-3 text-xs text-faint md:flex-col md:items-end md:gap-1">
              <span>{fmtDate(h.signedAt)}</span>
              <span className="flex items-center gap-1.5">
                <span className="hidden md:inline">Now</span>
                <StatusPill status={h.status} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
