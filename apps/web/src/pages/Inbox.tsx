import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ROLE_LABEL, type Classroom, type Connection, type Delegation, type InboxItem, type StaffDashboard } from '@plc/shared';
import { PersonBlock } from '../components/PersonBlock';
import { DecisionList } from '../components/Decisions';
import { Empty, Page, PageHeader, PinPad, SectionHead, Sheet, StatStrip, Tick, toast } from '../components/ui';
import { Icon } from '../components/Icon';
import { MySignature, SignatureSheet } from '../components/SignaturePad';
import { SignedDocument } from '../components/SignedDocument';
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
  // Sign in place: my saved signature (needed when the document has boxes for me)
  const { data: mySig, reload: reloadSig } = useLive<{ dataUrl: string | null }>('/api/me/signature', 120_000);
  const [sigOpen, setSigOpen] = useState(false);

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
  const myBoxes = item?.signing?.fields.filter((f) => f.step === mine?.stepNo).length ?? 0;

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

    // Busy: one filled CTA. Idle: a single quiet line, no dead button.
    const hero =
      items === null && !error ? (
        <div className="h-[88px] rounded-2xl bg-panel" />
      ) : count === 0 ? (
        <section className="flex items-center gap-3 rounded-2xl bg-ok-bg px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ok text-white">
            <Tick className="h-5 w-5" />
          </span>
          <p className="text-sm">
            <b className="font-semibold">All clear.</b> <span className="text-muted">Nothing is waiting for your signature; new requests appear here on their own.</span>
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-4 rounded-2xl border border-accent/30 bg-accent/5 p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div>
            <p className="text-xl font-bold">
              {count} waiting for your signature
            </p>
            <p className="mt-1 text-sm text-muted">
              Oldest first · waiting {ago(waitingSince(items![0]))}
              {items!.some((i) => stepOf(i)?.overdue) && <span className="font-semibold text-warn"> · reminders sent for some</span>}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 md:items-end">
            <button className="cta py-4" onClick={() => setMode('review')}>
              Review next ({count})
            </button>
            {count > 1 && (
              <button className="link min-h-[44px] self-center md:self-end" onClick={() => (setPicked([]), setMode('batch'))}>
                Approve several at once
              </button>
            )}
          </div>
        </section>
      );

    const queue = (
      <section>
        <SectionHead title={`Waiting for you${count ? ` (${count})` : ''}`} />
        {count === 0 ? (
          <Empty icon="inbox">No requests are waiting. Everything you signed is in your history.</Empty>
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
          <PageHeader title="To sign" subtitle="Documents other people sent you to sign." />
          <div className="flex flex-col gap-8">
            {count > 0 && hero}
            {queue}
            {error && <p className="text-sm text-bad">{error}</p>}
          </div>
        </Page>
      );

    const avg = dash?.avgResponseHours;
    return (
      <Page wide>
        <PageHeader
          title={`${hello}, ${me?.name}`}
          subtitle={`${me?.roles.map((r) => ROLE_LABEL[r]).join(' · ')} · ${me?.department} · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}`}
        />

        <div className="flex flex-col gap-8">
          {hero}

          <StatStrip
            items={[
              { label: 'Waiting for you', value: count, tone: count ? 'accent' : 'ink' },
              { label: 'Reminders sent', value: dash?.overdue ?? 0, tone: dash?.overdue ? 'warn' : 'ink', hint: 'waiting past the usual time' },
              { label: 'Signed this week', value: dash?.decided.thisWeek ?? '–', hint: dash ? `${dash.decided.total} in total` : undefined, to: '/history' },
              { label: 'Average response', value: avg == null ? '–' : avg < 1 ? '<1 h' : `${Math.round(avg)} h`, hint: 'opened to signed' },
            ]}
          />

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
                {dash && (dash.history.length === 0 ? <Empty icon="history">Requests you approve, return or reject are listed here.</Empty> : <DecisionList items={dash.history} />)}
                {!!dash?.decided.total && (
                  <p className="mt-2 text-xs text-faint">
                    {dash.decided.approved} approved · {dash.decided.returned} returned · {dash.decided.rejected} rejected
                  </p>
                )}
              </section>
            </div>

            {/* Side column: plain sections divided by hairlines, no cards */}
            <aside className="flex flex-col divide-y divide-rule border-t border-rule lg:border-t-0">
              <div className="lg:-mt-5">
                <MySignature compact />
              </div>
              <section className="py-5">
                <SectionHead title="Away from campus?" />
                <p className="text-sm text-muted">
                  {away ? (
                    <>
                      <b className="text-ink">{away.delegate.name}</b> is signing for you until {fmtDay(away.endsOn)}.
                    </>
                  ) : (
                    'A colleague can sign for you while you are away; the PDF says so.'
                  )}
                </p>
                <button className="link mt-2 min-h-[44px] font-semibold" onClick={() => setDelegating(true)}>
                  {away ? 'Manage delegate' : 'Set a delegate'} →
                </button>
              </section>

              {requests.length > 0 && (
                <section className="py-5">
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

              <section className="py-5">
                <SectionHead title="People" />
                <ul className="text-sm">
                  {[
                    { to: '/people?tab=students', label: 'My students', n: myStudents.length },
                    { to: '/people?tab=classes', label: 'Classes', n: classes?.filter((c) => c.code).length },
                  ].map((r) => (
                    <li key={r.label}>
                      <Link to={r.to} className="-mx-2 flex min-h-[44px] items-center justify-between rounded-lg px-2 hover:bg-panel">
                        <span>{r.label}</span>
                        <span className="flex items-center gap-1 font-semibold tabular-nums">
                          {r.n ?? '–'}
                          <Icon name="chevron" className="h-4 w-4 text-faint" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link to="/people?tab=classes" className="link mt-1 inline-flex min-h-[44px] items-center gap-1.5 font-semibold">
                  <Icon name="plus" className="h-4 w-4" /> Create a class
                </Link>
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
          {myBoxes > 0 && (
            <div className={`mb-4 rounded-xl px-3 py-3 text-sm ${mySig?.dataUrl ? 'bg-panel' : 'bg-warn-bg'}`}>
              {mySig?.dataUrl ? (
                <div className="flex items-center gap-3">
                  <img src={mySig.dataUrl} alt="Your signature" className="h-10 max-w-[45%] object-contain" />
                  <span className="text-muted">
                    Goes in <b className="text-ink">{myBoxes} place{myBoxes > 1 ? 's' : ''}</b> on this document when you approve.
                  </span>
                </div>
              ) : (
                <p>
                  <b className="text-warn">Add your signature to sign this document.</b>{' '}
                  <button className="link font-semibold" onClick={() => setSigOpen(true)}>
                    Add it now
                  </button>
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button className="rounded-xl bg-ok py-4 text-lg font-semibold text-white active:scale-[0.98]" onClick={() => (myBoxes > 0 && !mySig?.dataUrl ? setSigOpen(true) : setChoice('approved'))}>
              {myBoxes > 0 ? 'Approve and sign' : 'Approve'}
            </button>
            <button className="rounded-xl border-2 border-ink py-4 text-lg font-semibold active:scale-[0.98]" onClick={() => setChoice('returned')}>
              Return
            </button>
          </div>
          <button className="mt-3 w-full py-2 text-sm font-semibold text-bad" onClick={() => setChoice('rejected')}>
            Reject
          </button>
        </article>
        {item.signing ? (
          <section className="mt-8 lg:mt-0">
            <h2 className="mb-3 text-base font-semibold">The document {myBoxes > 0 && <span className="font-normal text-muted">· your boxes are highlighted</span>}</h2>
            <SignedDocument requestId={item.id} signing={item.signing} highlight={mine?.stepNo} />
          </section>
        ) : (
          <section className="hidden lg:block lg:rounded-2xl lg:border lg:border-rule lg:p-6">
            <h2 className="mb-3 text-base font-semibold">Approval chain</h2>
            <Timeline steps={item.timeline} />
          </section>
        )}
      </div>
      <SignatureSheet open={sigOpen} onClose={() => setSigOpen(false)} onSaved={() => reloadSig()} />

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
        {choice === 'approved' && myBoxes > 0 && mySig?.dataUrl && (
          <p className="mb-3 flex items-center justify-center gap-2 text-sm text-muted">
            <img src={mySig.dataUrl} alt="" className="h-7 object-contain" /> will be placed in {myBoxes} box{myBoxes > 1 ? 'es' : ''}
          </p>
        )}
        <p className="mb-3 text-center text-sm text-muted">Enter your PIN to sign</p>
        <PinPad onComplete={decide} busy={busy} reset={resetPin} />
      </Sheet>
    </Page>
  );
}
