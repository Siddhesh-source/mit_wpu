import { useState } from 'react';
import type { Stats } from '@plc/shared';

const compact = (n: number, digits = 1) =>
  n >= 1e7 ? `${(n / 1e7).toFixed(digits)} cr` : n >= 1e5 ? `${(n / 1e5).toFixed(digits)} lakh` : n >= 1000 ? `${(n / 1000).toFixed(digits)}K` : n % 1 ? n.toFixed(digits) : String(n);
const hours = (h: number | null) =>
  h == null ? '—' : h < 1 / 60 ? `${h * 3600 < 10 ? (h * 3600).toFixed(1) : Math.round(h * 3600)} s` : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`;

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-rule p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {note && <p className="mt-1 text-xs text-faint">{note}</p>}
    </div>
  );
}

/** Average wait per role, one series: where approvals get stuck. Bars in the deck's accent, values in ink. */
function WaitBars({ rows }: { rows: Stats['byRole'] }) {
  const [hover, setHover] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);
  const data = rows.filter((r) => r.avgWaitHours != null);
  const max = Math.max(...data.map((r) => r.avgWaitHours!), 0.0001);
  return (
    <section className="rounded-2xl border border-rule p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-semibold">Average wait per approver role</h3>
          <p className="text-xs text-muted">From the step opening to the signature. The longest bar is the bottleneck.</p>
        </div>
        <button className="link shrink-0 text-xs" onClick={() => setAsTable(!asTable)}>
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-faint">No decisions yet.</p>
      ) : asTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 font-normal">Role</th>
              <th className="pb-2 text-right font-normal">Avg wait</th>
              <th className="pb-2 text-right font-normal">Decided</th>
              <th className="pb-2 text-right font-normal">Waiting now</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.role} className="border-t border-rule">
                <td className="py-1.5">{r.roleLabel}</td>
                <td className="py-1.5 text-right tabular-nums">{hours(r.avgWaitHours)}</td>
                <td className="py-1.5 text-right tabular-nums">{r.decided}</td>
                <td className="py-1.5 text-right tabular-nums">{r.pending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((r) => (
            <li
              key={r.role}
              className="relative grid grid-cols-[8.5rem_1fr] items-center gap-3 rounded-lg py-1 text-sm"
              onMouseEnter={() => setHover(r.role)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(r.role)}
              onBlur={() => setHover(null)}
              tabIndex={0}
            >
              <span className="truncate text-muted">{r.roleLabel}</span>
              <span className="flex items-center gap-2">
                <span
                  className={`h-5 rounded-r-[4px] bg-accent transition-opacity ${hover && hover !== r.role ? 'opacity-40' : ''}`}
                  style={{ width: `${Math.max(2, (r.avgWaitHours! / max) * 80)}%` }}
                />
                <span className="tabular-nums text-ink">{hours(r.avgWaitHours)}</span>
              </span>
              {hover === r.role && (
                <span className="pointer-events-none absolute left-0 right-0 top-full z-10 mt-1 rounded-lg bg-ink px-3 py-1.5 text-xs text-white shadow md:left-[9.25rem] md:right-auto md:whitespace-nowrap">
                  {r.roleLabel}: {hours(r.avgWaitHours)} average · {r.decided} decided · {r.pending} waiting now
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ImpactDashboard({ s }: { s: Stats }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl bg-panel p-6">
        <p className="text-sm text-muted">Approvals digitised and sealed</p>
        <p className="text-6xl font-semibold tracking-tight text-ink">{compact(s.digitised, 0)}</p>
        <p className="mt-1 text-sm text-muted">
          of {s.requests} requests · {s.inReview} in review{s.overdue ? ` · ${s.overdue} overdue` : ''}
        </p>
      </section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Sheets of paper saved" value={compact(s.sheetsSaved)} note="est." />
        <Tile label="CO2e avoided" value={s.co2Kg < 1 ? `${Math.round(s.co2Kg * 1000)} g` : `${compact(s.co2Kg)} kg`} note="est., paper production only" />
        <Tile label="Trees saved" value={s.trees < 1 ? s.trees.toFixed(3) : compact(s.trees)} note="est." />
        <Tile label="Avg time to sealed" value={hours(s.avgTurnaroundHours)} note="paper today: 2 to 4 days" />
      </div>
      <WaitBars rows={s.byRole} />
      {s.byType.length > 0 && (
        <p className="text-sm text-muted">
          By type: {s.byType.map((t) => `${t.name} ${t.count}`).join(' · ')}
        </p>
      )}
      <p className="text-xs text-faint">Assumptions: {s.assumptions}</p>
    </div>
  );
}
