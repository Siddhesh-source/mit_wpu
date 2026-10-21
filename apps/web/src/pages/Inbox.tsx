import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_LABEL, type InboxItem } from '@plc/shared';
import { Page, PinPad, Sheet, Tick, toast } from '../components/ui';
import { FieldList } from '../components/FormFields';
import { Timeline } from '../components/Timeline';
import { api } from '../lib/api';
import { ago, useLive } from '../lib/hooks';
import { useSession } from '../lib/session';

type Choice = 'approved' | 'returned' | 'rejected';
const VERB: Record<Choice, string> = { approved: 'Approve', returned: 'Return', rejected: 'Reject' };
const DONE: Record<Choice, string> = { approved: 'Approved', returned: 'Returned', rejected: 'Rejected' };

export default function Inbox() {
  const { me } = useSession();
  const { data: items, error, reload } = useLive<InboxItem[]>('/api/inbox');
  const [reviewing, setReviewing] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetPin, setResetPin] = useState(0);

  const item = items?.[0];
  const count = items?.length ?? 0;

  async function decide(pin: string) {
    if (!item || !choice) return;
    if (choice !== 'approved' && !comment.trim()) {
      toast('Add a short comment so the student knows why');
      setResetPin((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/approvals/${item.approvalId}/decide`, { method: 'POST', json: { decision: choice, comment, pin } });
      toast(`${DONE[choice]} · ${item.title}`);
      setChoice(null);
      setComment('');
      await reload();
    } catch (e) {
      toast((e as Error).message);
      setResetPin((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  // Home: one central CTA
  if (!reviewing || !item)
    return (
      <Page>
        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          {items === null && !error ? null : count === 0 ? (
            <>
              <span className="grid h-20 w-20 place-items-center rounded-full bg-ok text-white">
                <Tick className="h-10 w-10" />
              </span>
              <p className="text-xl font-semibold">All clear</p>
              <p className="text-sm text-muted">Nothing waiting for you. New requests show up here on their own.</p>
            </>
          ) : (
            <>
              <button className="cta w-full max-w-xs" onClick={() => setReviewing(true)}>
                Review next ({count})
              </button>
              <p className="max-w-xs text-sm text-muted">
                Oldest first. Waiting since {ago(items![0].withNow.find((w) => w.role === items![0].myRole)?.since ?? items![0].updatedAt)}.
              </p>
            </>
          )}
          {error && <p className="text-sm text-bad">{error}</p>}
          {me?.roles.includes('security') && (
            <Link to="/gate" className="link mt-4 text-base">
              Gate check
            </Link>
          )}
        </section>
      </Page>
    );

  // Review: the phone card from deck slide 7; on desktop the request's chain sits beside it
  return (
    <Page wide>
      <div className="mb-3 flex items-center justify-between text-sm">
        <button className="link" onClick={() => setReviewing(false)}>
          ← Inbox
        </button>
        <span className="text-muted">{count} pending</span>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-12">
      <article className="rounded-3xl border-2 border-ink p-5 md:p-7">
        <p className="font-mono text-xs uppercase tracking-wide text-accent">{item.typeName}</p>
        <h1 className="mt-1 text-2xl font-bold">{item.title}</h1>
        <p className="text-sm text-muted">
          {item.student.name} · {item.student.title}
        </p>
        {item.amendment && (
          <p className="mt-3 rounded-xl bg-warn-bg px-3 py-2 text-sm">
            <span className="font-semibold text-warn">Amendment to v{item.amendment.fromVersion}:</span> {item.amendment.reason}
          </p>
        )}
        <div className="my-4 rounded-2xl bg-panel p-4">
          <FieldList fields={item.fields} form={item.form} previous={item.amendment?.previous} />
        </div>
        <p className="mb-4 text-xs text-faint">
          You sign as {ROLE_LABEL[item.myRole]} ·{' '}
          <Link to={`/requests/${item.id}`} className="link text-xs">
            See full chain
          </Link>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button className="rounded-xl bg-ok py-4 text-lg font-semibold text-white active:scale-[0.98]" onClick={() => setChoice('approved')}>
            Approve
          </button>
          <button className="rounded-xl border-2 border-ink py-4 text-lg font-semibold active:scale-[0.98]" onClick={() => setChoice('returned')}>
            Return
          </button>
        </div>
        <button className="mt-3 w-full py-2 text-sm font-semibold text-bad" onClick={() => setChoice('rejected')}>
          Reject
        </button>
      </article>
      <section className="hidden lg:block lg:rounded-3xl lg:border lg:border-rule lg:p-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Approval chain</h2>
        <Timeline steps={item.timeline} />
      </section>
      </div>

      <Sheet open={!!choice} onClose={() => !busy && (setChoice(null), setComment(''))}>
        <h2 className="text-lg font-bold">
          {choice && VERB[choice]} “{item.title}”
        </h2>
        <textarea
          rows={2}
          placeholder={choice === 'approved' ? 'Comment (optional)' : 'Tell the student why (required)'}
          className="my-4 w-full rounded-xl border border-rule px-4 py-3 outline-none focus:border-accent"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <p className="mb-3 text-center text-sm text-muted">Enter your PIN to sign</p>
        <PinPad onComplete={decide} busy={busy} reset={resetPin} />
      </Sheet>
    </Page>
  );
}
