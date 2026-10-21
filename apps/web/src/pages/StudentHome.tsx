import { Link } from 'react-router-dom';
import type { RequestSummary } from '@plc/shared';
import { Page, StatusPill } from '../components/ui';
import { ago, useLive } from '../lib/hooks';

export default function StudentHome() {
  const { data: mine, error } = useLive<RequestSummary[]>('/api/requests/mine');

  return (
    <Page>
      <section className="flex flex-col items-center gap-3 py-10 text-center">
        <Link to="/student/new" className="cta w-full max-w-xs">
          New request
        </Link>
        <p className="max-w-xs text-sm text-muted">Pick a form, fill it once, and track every signature.</p>
      </section>

      {error && <p className="text-center text-sm text-bad">{error}</p>}
      {mine && mine.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">My requests</h2>
          <ul className="flex flex-col gap-2">
            {mine.map((r) => (
              <li key={r.id}>
                <Link to={`/requests/${r.id}`} className="block rounded-2xl border border-rule bg-panel p-4 active:bg-rule">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.title}</p>
                      <p className="text-xs text-muted">{r.typeName}</p>
                    </div>
                    <StatusPill status={r.status} />
                  </div>
                  {r.withNow.length > 0 && (
                    <p className="mt-2 text-sm text-muted">
                      With: {r.withNow.map((w) => w.roleLabel).join(' and ')} (since {ago(r.withNow[0].since)})
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
