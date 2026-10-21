import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ROLE_LABEL, type Classroom, type Connection, type Delegation, type InboxItem, type StaffDashboard } from '@plc/shared';
import { PersonBlock } from '../components/PersonBlock';
import { DecisionList } from '../components/Decisions';
import { Empty, Page, PinPad, SectionHead, Sheet, StatTile, Tick, toast } from '../components/ui';
import { FieldList } from '../components/FormFields';
import { Timeline } from '../components/Timeline';
import { AttachmentList } from '../components/Attachments';
import { api } from '../lib/api';
import { ago, fmtDay, useLive } from '../lib/hooks';
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
  const [params, setParams] = useSearchParams();
  const [mode, setModeState] = useState<'home' | 'review' | 'batch'>(params.has('review') ? 'review' : 'home');
  /** The item being reviewed; null = the oldest waiting. */
  const [current, setCurrent] = useState<number | null>(Number(params.get('review')) || null);
  const setMode = (m: 'home' | 'review' | 'batch', approvalId: number | null = null) => {
    setModeState(m);
    setCurrent(approvalId);
    setParams(m === 'review' ? { review: String(approvalId ?? '') } : {}, { replace: true });
  };
  const [choice, setChoice] = useState<Choice | null>(null);
  const [comment, setComment] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [batchPin, setBatchPin] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetPin, setResetPin] = useState(0);

  const isStudent = !!me?.roles.includes('student');
  const { data: conns, reload: reloadConns } = useLive<Connection[]>(isStudent ? null : '/api/connections', 8000);
  const { data: dash, reload: reloadDash } = useLive<StaffDashboard>(isStudent ? null : '/api/dashboard?limit=6', 15_000);
  const requests = conns?.filter((c) => c.status === 'pending') ?? [];
  const myStudents = conns?.filter((c) => c.status === 'accepted') ?? [];
  const { data: classes } = useLive<Classroom[]>(isStudent ? null : '/api/classrooms', 30_000);
  async function answer(c: Connection, how: 'accept' | 'decline') {
    await api(`/api/connections/${c.id}/${how}`, { method: 'POST' }).catch((e) => toast(e.message));
    toast(how === 'accept' ? `${c.person.name} can now send you documents from their dashboard` : 'Declined');
    reloadConns();
  }

  const item = items?.find((i) => i.approvalId === current) ?? items?.[0];
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
      setCurrent(null);
      await reload();
      reloadDash();
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
      reloadDash();
    } catch (e) {
      toast((e as Error).message);
      setResetPin((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  // Batch: tick routine items, approve with one PIN
  if (mode === 'batch' && items)
    return (
      <Page wide>
        <div className="mb-4 flex items-center justify-between">
          <button className="link" onClick={() => setMode('home')}>
            ← {isStudent ? 'To sign' : 'Dashboard'}
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

  // Home: the dashboard. One central CTA (Review next), then the queue, numbers, history and people.
  if (mode !== 'review' || !item) {
    const waitingSince = (i: InboxItem) => i.withNow.find((w) => w.role === i.myRole)?.since ?? i.updatedAt;
    const stepOf = (i: InboxItem) => i.timeline.find((s) => s.approvalId === i.approvalId);
    const hour = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
    const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const away = dash?.delegation;

    const hero = (
      <section className="flex flex-col gap-5 rounded-3xl border border-rule bg-panel p-6 md:flex-row md:items-center md:justify-between md:p-8">
        {items === null && !error ? (
          <p className="text-muted">Loading…</p>
        ) : count === 0 ? (
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ok text-white">
              <Tick className="h-7 w-7" />
            </span>
            <div>
              <p className="text-xl font-semibold">All clear</p>
              <p className="text-sm text-muted">Nothing is waiting for your signature. New requests appear here on their own.</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-2xl font-bold">{count} waiting for your signature</p>
            <p className="mt-1 text-sm text-muted">
              Oldest first · waiting {ago(waitingSince(items![0]))}
              {items!.some((i) => stepOf(i)?.overdue) && <span className="font-semibold text-warn"> · reminders sent for some</span>}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2 md:items-end">
          <button className="cta w-full md:w-auto" disabled={!count} onClick={() => setMode('review')}>
            {count ? `Review next (${count})` : 'Nothing to review'}
          </button>
          <div className="flex flex-wrap justify-center gap-4 md:justify-end">
            {count > 1 && (
              <button className="link" onClick={() => (setPicked([]), setMode('batch'))}>
                Approve several
              </button>
            )}
            {isStudent && (
              <Link to="/student" className="link">
                Back to my dashboard
              </Link>
            )}
          </div>
        </div>
      </section>
    );

    const queue = (
      <section>
        <SectionHead title={`Waiting for you${count ? ` (${count})` : ''}`} />
        {count === 0 ? (
          <Empty>No requests are waiting. Everything you signed is in your history.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-2xl border border-rule">
            {items!.map((i) => {
              const step = stepOf(i);
              return (
                <li key={i.approvalId}>
                  <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-panel" onClick={() => setMode('review', i.approvalId)}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold">{i.title}</span>
                        {i.amendment && <span className="shrink-0 rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn">Amendment</span>}
                        {step?.escalated ? (
                          <span className="shrink-0 rounded-full bg-bad-bg px-2 py-0.5 text-[11px] font-semibold text-bad">Escalated</span>
                        ) : (
                          step?.overdue && <span className="shrink-0 rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn">Reminder sent</span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {i.typeName} · {i.student.name} · as {ROLE_LABEL[i.myRole]}
                        {step?.onBehalfOf && ` for ${step.onBehalfOf.name}`}
                        {i.attachments.length > 0 && ` · ${i.attachments.length} file(s)`}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-xs text-faint sm:inline">{ago(waitingSince(i))}</span>
                    <span className="shrink-0 text-sm font-semibold text-accent">Review →</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );

    // A student opening "To sign": the queue only.
    if (isStudent)
      return (
        <Page wide>
          <div className="flex flex-col gap-8">
            {hero}
            {queue}
            {error && <p className="text-sm text-bad">{error}</p>}
          </div>
        </Page>
      );

    const avg = dash?.avgResponseHours;
    return (
      <Page wide>
        <div className="mb-6">
          <h1 className="text-2xl font-bold md:text-3xl">
            {hello}, {me?.name}
          </h1>
          <p className="text-sm text-muted">
            {me?.roles.map((r) => ROLE_LABEL[r]).join(' · ')} · {me?.department} ·{' '}
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}
          </p>
        </div>

        <div className="flex flex-col gap-8">
          {hero}

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Waiting" value={count} tone="accent" hint="for your signature" />
            <StatTile label="Reminders sent" value={dash?.overdue ?? 0} tone={dash?.overdue ? 'warn' : 'ink'} hint="waiting past the usual time" />
            <StatTile label="Signed this week" value={dash?.decided.thisWeek ?? '–'} tone="ok" hint={dash ? `${dash.decided.total} in total · see history` : undefined} to="/history" />
            <StatTile label="Avg response" value={avg == null ? '–' : avg < 1 ? '<1 h' : `${Math.round(avg)} h`} hint="from opened to signed" />
          </section>

          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-10">
            <div className="flex flex-col gap-8">
              {queue}
              <section>
                <SectionHead title="Recent decisions">
                  {!!dash?.history.length && (
                    <Link to="/history" className="link">
                      All history →
                    </Link>
                  )}
                </SectionHead>
                {dash && (dash.history.length === 0 ? <Empty>Requests you approve, return or reject are listed here.</Empty> : <DecisionList items={dash.history} />)}
                {!!dash?.decided.total && (
                  <p className="mt-2 text-xs text-faint">
                    {dash.decided.approved} approved · {dash.decided.returned} returned · {dash.decided.rejected} rejected
                  </p>
                )}
              </section>
            </div>

            <aside className="flex flex-col gap-6">
              <section className="rounded-2xl border border-rule p-4">
                <SectionHead title="Away from campus?" />
                <p className="mb-3 text-sm text-muted">
                  {away ? (
                    <>
                      <b className="text-ink">{away.delegate.name}</b> is signing for you until {fmtDay(away.endsOn)}.
                    </>
                  ) : (
                    'Hand your approvals to a colleague for a few days. They sign on your behalf, and the PDF says so.'
                  )}
                </p>
                <button className="w-full rounded-xl border-2 border-accent px-4 py-2.5 text-sm font-semibold text-accent" onClick={() => setDelegating(true)}>
                  {away ? 'Manage delegate' : 'Set a delegate'}
                </button>
              </section>

              {requests.length > 0 && (
                <section>
                  <SectionHead title={`Students who want to add you (${requests.length})`} />
                  <div className="flex flex-col gap-3">
                    {requests.map((c) => (
                      <PersonBlock key={c.id} p={c.person}>
                        <button className="flex-1 rounded-xl bg-ok px-4 py-2 text-sm font-semibold text-white" onClick={() => answer(c, 'accept')}>
                          Accept
                        </button>
                        <button className="rounded-xl border border-rule px-4 py-2 text-sm font-semibold" onClick={() => answer(c, 'decline')}>
                          Decline
                        </button>
                      </PersonBlock>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-rule p-4">
                <SectionHead title="People">
                  <Link to="/people" className="link">
                    Open →
                  </Link>
                </SectionHead>
                <div className="grid grid-cols-2 gap-3">
                  <Link to="/people?tab=students" className="rounded-xl bg-panel p-3 hover:bg-rule">
                    <p className="text-2xl font-bold tabular-nums">{myStudents.length}</p>
                    <p className="text-xs text-muted">My students</p>
                  </Link>
                  <Link to="/people?tab=classes" className="rounded-xl bg-panel p-3 hover:bg-rule">
                    <p className="text-2xl font-bold tabular-nums">{classes?.filter((c) => c.code).length ?? '–'}</p>
                    <p className="text-xs text-muted">Classes</p>
                  </Link>
                </div>
                <Link to="/people?tab=classes" className="mt-3 block text-center text-sm font-semibold text-accent">
                  + Create a class and invite students
                </Link>
              </section>

              <section className="rounded-2xl border border-rule p-4">
                <SectionHead title="Quick links" />
                <div className="flex flex-col gap-2">
                  <Link to="/verify" className="link">
                    Verify a document (scan QR or upload PDF)
                  </Link>
                  {me?.roles.includes('security') && (
                    <Link to="/gate" className="link">
                      Open the gate check
                    </Link>
                  )}
                  <Link to="/history" className="link">
                    My decision history
                  </Link>
                  <Link to="/profile" className="link">
                    My profile
                  </Link>
                </div>
              </section>
            </aside>
          </div>
          {error && <p className="text-sm text-bad">{error}</p>}
        </div>
        <DelegateSheet open={delegating} onClose={() => setDelegating(false)} onChanged={() => (reload(), reloadDash())} />
      </Page>
    );
  }

  // Review: the phone card from deck slide 7; on desktop the request's chain sits beside it
  return (
    <Page wide>
      <div className="mb-3 flex items-center justify-between text-sm">
        <button className="link" onClick={() => setMode('home')}>
          ← {isStudent ? 'To sign' : 'Dashboard'}
        </button>
        <span className="text-muted">
          {(items?.indexOf(item) ?? 0) + 1} of {count} waiting
        </span>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-12">
        <article className="rounded-3xl border-2 border-ink p-5 md:p-7">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-xs uppercase tracking-wide text-accent">
              {item.typeName}
              {item.type === 'document_signature' && ` · from ${item.student.name}`}
            </p>
            {mine?.escalated ? (
              <span className="rounded-full bg-bad-bg px-2 py-0.5 text-[11px] font-semibold text-bad">Escalated</span>
            ) : (
              mine?.overdue && <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn">Reminder sent</span>
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
            {item.myRole === 'recipient' ? 'Sent to you to sign' : `You sign as ${ROLE_LABEL[item.myRole]}`} ·{' '}
            <Link to={`/requests/${item.id}`} className="link text-xs">
              See full chain{item.commentCount ? ` · Discussion (${item.commentCount})` : ' · Ask the student'}
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
