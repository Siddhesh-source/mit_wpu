import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_LABEL, type Delegation, type InboxItem } from '@plc/shared';
import { Page, PinPad, Sheet, Tick, toast } from '../components/ui';
import { FieldList } from '../components/FormFields';
import { Timeline } from '../components/Timeline';
import { AttachmentList } from '../components/Attachments';
import { api } from '../lib/api';
import { ago, useLive } from '../lib/hooks';
import { useSession } from '../lib/session';

type Choice = 'approved' | 'returned' | 'rejected';
const VERB: Record<Choice, string> = { approved: 'Approve', returned: 'Return', rejected: 'Reject' };
const DONE: Record<Choice, string> = { approved: 'Approved', returned: 'Returned', rejected: 'Rejected' };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** "Away? Set a delegate": route my approvals to a colleague for a date range. */
function DelegateSheet({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<{ mine: Delegation[]; colleagues: { id: string; name: string; title: string }[] } | null>(null);
  const [who, setWho] = useState('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const load = () => api<typeof data>('/api/delegations').then((d) => (setData(d), setWho((w) => w || d?.colleagues[0]?.id || '')));
  useEffect(() => {
    if (open) load().catch((e) => toast(e.message));
  }, [open]);

  async function save() {
    setBusy(true);
    try {
      const r = await api<{ moved: number }>('/api/delegations', { method: 'POST', json: { delegateId: who, startsOn: from, endsOn: to } });
      toast(r.moved ? `${r.moved} waiting item(s) moved to your delegate` : 'Delegate set');
      await load();
      onChanged();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function end(id: number) {
    await api(`/api/delegations/${id}`, { method: 'DELETE' }).catch((e) => toast(e.message));
    await load();
    onChanged();
  }

  const field = 'w-full rounded-xl border border-rule px-3 py-2.5 outline-none focus:border-accent';
  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-lg font-bold">Away? Set a delegate</h2>
      <p className="mb-4 text-sm text-muted">While you are away, your approvals go to this colleague. They sign on your behalf, and that is recorded.</p>
      {data?.mine.map((d) => (
        <p key={d.id} className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-ok-bg px-3 py-2 text-sm text-ok">
          <span>
            {d.delegate.name} covers {d.startsOn === d.endsOn ? d.startsOn : `${d.startsOn} to ${d.endsOn}`}
          </span>
          <button className="font-semibold text-bad" onClick={() => end(d.id)}>
            End
          </button>
        </p>
      ))}
      <label className="mb-3 block text-sm font-semibold">
        Colleague
        <select className={`${field} mt-1 bg-bg font-normal`} value={who} onChange={(e) => setWho(e.target.value)}>
          {data?.colleagues.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.title}
            </option>
          ))}
        </select>
      </label>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <label className="text-sm font-semibold">
          From
          <input type="date" className={`${field} mt-1 font-normal`} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          To
          <input type="date" className={`${field} mt-1 font-normal`} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <button className="cta w-full" disabled={busy || !who} onClick={save}>
        {busy ? 'Saving…' : 'Set delegate'}
      </button>
    </Sheet>
  );
}

export default function Inbox() {
  const { me } = useSession();
  const { data: items, error, reload } = useLive<InboxItem[]>('/api/inbox');
  const [mode, setMode] = useState<'home' | 'review' | 'batch'>('home');
  const [choice, setChoice] = useState<Choice | null>(null);
  const [comment, setComment] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [batchPin, setBatchPin] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetPin, setResetPin] = useState(0);

  const item = items?.[0];
  const count = items?.length ?? 0;
  const mine = item?.timeline.find((s) => s.approvalId === item.approvalId);

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

  async function approveSelected(pin: string) {
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; error?: string }[]>('/api/approvals/batch', { method: 'POST', json: { ids: picked, pin } });
      const ok = res.filter((r) => r.ok).length;
      toast(ok === res.length ? `Approved ${ok}` : `Approved ${ok} of ${res.length}; ${res.find((r) => !r.ok)?.error}`);
      setPicked([]);
      setBatchPin(false);
      setMode('home');
      await reload();
    } catch (e) {
      toast((e as Error).message);
      setResetPin((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  const tools = (
    <div className="mt-6 flex flex-wrap justify-center gap-5">
      {count > 1 && (
        <button className="link text-base" onClick={() => (setPicked([]), setMode('batch'))}>
          Approve several
        </button>
      )}
      <button className="link text-base" onClick={() => setDelegating(true)}>
        Away? Set a delegate
      </button>
      {me?.roles.includes('security') && (
        <Link to="/gate" className="link text-base">
          Back to gate
        </Link>
      )}
    </div>
  );

  // Batch: tick routine items, approve with one PIN
  if (mode === 'batch' && items)
    return (
      <Page wide>
        <div className="mb-4 flex items-center justify-between">
          <button className="link" onClick={() => setMode('home')}>
            ← Inbox
          </button>
          <button className="link text-sm" onClick={() => setPicked(picked.length === items.length ? [] : items.map((i) => i.approvalId))}>
            {picked.length === items.length ? 'Clear' : 'Select all'}
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {items.map((i) => {
            const on = picked.includes(i.approvalId);
            return (
              <li key={i.approvalId}>
                <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${on ? 'border-accent bg-panel' : 'border-rule'}`}>
                  <input type="checkbox" className="mt-1 h-5 w-5 accent-accent" checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== i.approvalId) : [...picked, i.approvalId])} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{i.title}</span>
                    <span className="block text-sm text-muted">
                      {i.typeName} · {i.student.name} · as {ROLE_LABEL[i.myRole]}
                      {i.amendment && ' · amendment'}
                      {i.attachments.length > 0 && ` · ${i.attachments.length} file(s)`}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="sticky bottom-0 mt-6 bg-bg py-3">
          <button className="w-full rounded-xl bg-ok py-4 text-lg font-semibold text-white disabled:opacity-40" disabled={!picked.length} onClick={() => setBatchPin(true)}>
            Approve selected ({picked.length})
          </button>
          <p className="mt-2 text-center text-xs text-faint">Each one is still signed and recorded separately. Return or reject one at a time.</p>
        </div>
        <Sheet open={batchPin} onClose={() => !busy && setBatchPin(false)}>
          <h2 className="mb-4 text-lg font-bold">Approve {picked.length} requests</h2>
          <p className="mb-3 text-center text-sm text-muted">Enter your PIN to sign them</p>
          <PinPad onComplete={approveSelected} busy={busy} reset={resetPin} />
        </Sheet>
      </Page>
    );

  // Home: one central CTA
  if (mode !== 'review' || !item)
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
              <button className="cta w-full max-w-xs" onClick={() => setMode('review')}>
                Review next ({count})
              </button>
              <p className="max-w-xs text-sm text-muted">
                Oldest first. Waiting since {ago(items![0].withNow.find((w) => w.role === items![0].myRole)?.since ?? items![0].updatedAt)}.
                {items!.some((i) => i.timeline.find((s) => s.approvalId === i.approvalId)?.overdue) && <span className="font-semibold text-warn"> Some are overdue.</span>}
              </p>
            </>
          )}
          {error && <p className="text-sm text-bad">{error}</p>}
          {tools}
        </section>
        <DelegateSheet open={delegating} onClose={() => setDelegating(false)} onChanged={reload} />
      </Page>
    );

  // Review: the phone card from deck slide 7; on desktop the request's chain sits beside it
  return (
    <Page wide>
      <div className="mb-3 flex items-center justify-between text-sm">
        <button className="link" onClick={() => setMode('home')}>
          ← Inbox
        </button>
        <span className="text-muted">{count} pending</span>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-12">
        <article className="rounded-3xl border-2 border-ink p-5 md:p-7">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-xs uppercase tracking-wide text-accent">{item.typeName}</p>
            {mine?.escalated ? (
              <span className="rounded-full bg-bad-bg px-2 py-0.5 text-[11px] font-semibold text-bad">Escalated</span>
            ) : (
              mine?.overdue && <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn">Overdue</span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold">{item.title}</h1>
          <p className="text-sm text-muted">
            {item.student.name} · {item.student.title}
          </p>
          {mine?.onBehalfOf && (
            <p className="mt-3 rounded-xl bg-panel px-3 py-2 text-sm">
              You are signing <b>for {mine.onBehalfOf.name}</b> ({ROLE_LABEL[item.myRole]}), who is away.
            </p>
          )}
          {item.amendment && (
            <p className="mt-3 rounded-xl bg-warn-bg px-3 py-2 text-sm">
              <span className="font-semibold text-warn">Amendment to v{item.amendment.fromVersion}:</span> {item.amendment.reason}
            </p>
          )}
          <div className="my-4 rounded-2xl bg-panel p-4">
            <FieldList fields={item.fields} form={item.form} previous={item.amendment?.previous} />
          </div>
          {item.attachments.length > 0 && (
            <div className="mb-4">
              <AttachmentList items={item.attachments} />
            </div>
          )}
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
