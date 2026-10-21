import { useState } from 'react';
import type { VersionHistory } from '@plc/shared';
import { Tick } from './ui';
import { fmtDate } from '../lib/hooks';
import { download } from '../lib/api';

const STATE: Record<VersionHistory['state'], { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-ok-bg text-ok border-ok/30' },
  superseded: { label: 'Superseded', cls: 'bg-warn-bg text-warn border-warn/30' },
  revoked: { label: 'Revoked', cls: 'bg-bad-bg text-bad border-bad/30' },
  sealing: { label: 'Signing', cls: 'bg-panel text-accent border-rule' },
  in_review: { label: 'In review', cls: 'bg-panel text-accent border-rule' },
  abandoned: { label: 'Returned', cls: 'bg-panel text-faint border-rule' },
};

/** "v1 Superseded → v2 Active". Tap a version to see who approved it, and on which version they signed. */
export function VersionStrip({ requestId, versions, onError }: { requestId: string; versions: VersionHistory[]; onError: (m: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const sel = versions.find((v) => v.version === open);
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-base font-semibold">Versions</h2>
      <div className="flex flex-wrap items-center gap-2">
        {versions.map((v, i) => (
          <span key={v.version} className="flex items-center gap-2">
            {i > 0 && <span className="text-faint">→</span>}
            <button
              onClick={() => setOpen(open === v.version ? null : v.version)}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${STATE[v.state].cls} ${open === v.version ? 'ring-2 ring-accent/40' : ''}`}
            >
              v{v.version} {STATE[v.state].label}
            </button>
          </span>
        ))}
      </div>
      {sel && (
        <div className="mt-3 rounded-2xl border border-rule p-4 text-sm">
          {sel.reason && <p className="mb-2 text-muted">Why: {sel.reason}</p>}
          <ul className="flex flex-col gap-2">
            {sel.approvals.map((a) => (
              <li key={a.role} className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2">
                  {a.decision === 'approved' || a.carried ? (
                    <span className={`grid h-5 w-5 place-items-center rounded-full ${a.carried ? 'border-2 border-ok text-ok' : 'bg-ok text-white'}`}>
                      <Tick className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="h-5 w-5 rounded-full border-2 border-rule" />
                  )}
                  <span>
                    <span className="font-semibold">{a.roleLabel}</span> <span className="text-muted">· {a.name}</span>
                  </span>
                </span>
                <span className="text-right text-xs text-muted">
                  {a.decision === 'approved' || a.carried ? (
                    <>
                      signed v{a.signedVersion}
                      {a.carried && ', carried'}
                      <br />
                      {fmtDate(a.signedAt)}
                    </>
                  ) : (
                    a.decision
                  )}
                </span>
              </li>
            ))}
          </ul>
          {sel.docHash && (
            <div className="mt-3 flex items-center justify-between border-t border-rule pt-3 text-xs">
              <span className="font-mono text-faint">sha256 {sel.docHash.slice(0, 12)}…</span>
              <button className="link text-xs" onClick={() => download(`/api/requests/${requestId}/pdf?v=${sel.version}`, `${requestId}-v${sel.version}.pdf`).catch((e) => onError(e.message))}>
                Download v{sel.version} PDF
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
