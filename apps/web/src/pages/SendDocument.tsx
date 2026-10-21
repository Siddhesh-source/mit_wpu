import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { AttachmentInfo, Connection, FormTemplate, LibraryDocument, Person, RequestDetail, SignField } from '@plc/shared';
import { Page, PageHeader, SectionHead, Sheet, toast } from '../components/ui';
import { DocumentLibrary } from '../components/DocumentLibrary';
import { PersonBlock } from '../components/PersonBlock';
import { PdfSigner, SIGNER_COLORS } from '../components/PdfSigner';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { useLive } from '../lib/hooks';
import { fetchBytes, findSpots, openPdf, type FoundSpot } from '../lib/pdf';

type Tab = 'all' | 'staff' | 'student';
type Slot = { label: string; person: Person | null };

const LABELS = ['Guide', 'Project Coordinator', 'Head of Department', 'Class Teacher', 'Mentor', 'T&P Coordinator', 'Faculty In-charge', 'Dean Student Affairs', 'Principal'];
const defaultLabel = (p: Person) => (p.role === 'hod' ? 'Head of Department' : p.role === 'faculty' ? 'Guide' : p.roleLabel);
const field = 'w-full rounded-xl border border-rule px-4 py-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

/** Pick anyone (staff or student); your teachers first. */
function PeoplePicker({ onPick, exclude }: { onPick: (p: Person) => void; exclude: string[] }) {
  const { data: conns } = useLive<Connection[]>('/api/connections', 60_000);
  const [tab, setTab] = useState<Tab>('staff');
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Person[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const kind = tab === 'all' ? '' : `&kind=${tab}`;
      api<Person[]>(`/api/people?q=${encodeURIComponent(q)}${kind}`).then(setPeople).catch(() => setPeople([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, tab]);
  const teacherIds = new Set(conns?.filter((c) => c.status === 'accepted').map((c) => c.person.id));
  const sorted = [...(people ?? [])].filter((p) => !exclude.includes(p.id)).sort((a, b) => Number(teacherIds.has(b.id)) - Number(teacherIds.has(a.id)));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-panel p-1">
          {(['staff', 'student', 'all'] as Tab[]).map((t) => (
            <button type="button" key={t} onClick={() => setTab(t)} className={`min-h-[36px] rounded-lg px-3 text-sm font-semibold ${tab === t ? 'bg-bg shadow-sm' : 'text-muted hover:text-ink'}`}>
              {t === 'all' ? 'All' : t === 'staff' ? 'Staff' : 'Students'}
            </button>
          ))}
        </div>
        <label className="relative block min-w-[10rem] flex-1">
          <span className="sr-only">Search people</span>
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input autoFocus className="w-full rounded-xl border border-rule py-2.5 pl-10 pr-4 outline-none focus:border-accent" placeholder="Name, designation or department" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
        {sorted.map((p) => (
          <button type="button" key={p.id} className="text-left" onClick={() => onPick(p)}>
            <PersonBlock p={p}>
              {teacherIds.has(p.id) && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok">
                  <Icon name="check" className="h-4 w-4" /> Your teacher
                </span>
              )}
            </PersonBlock>
          </button>
        ))}
        {people && sorted.length === 0 && <p className="text-sm text-faint">Nobody matches.</p>}
      </div>
    </div>
  );
}

/** What to search for to suggest people for a "signs as" label (designations, as the directory stores them). */
const SUGGEST: Record<string, string> = {
  guide: 'faculty',
  mentor: 'faculty',
  'class teacher': 'faculty',
  'faculty in-charge': 'faculty',
  'project coordinator': 'faculty_coordinator',
  'head of department': 'hod',
  hod: 'hod',
  'dean student affairs': 'dean',
  dean: 'dean',
};

/** One-tap choices for an empty slot: matching staff, your own teachers first. */
function Suggestions({ label, exclude, onPick, onMore }: { label: string; exclude: string[]; onPick: (p: Person) => void; onMore: () => void }) {
  const q = SUGGEST[label.trim().toLowerCase()];
  const { data: people } = useLive<Person[]>(q ? `/api/people?kind=staff&q=${encodeURIComponent(q)}` : null, 120_000);
  const { data: conns } = useLive<Connection[]>('/api/connections', 120_000);
  const mine = new Set(conns?.filter((c) => c.status === 'accepted').map((c) => c.person.id));
  const list = (people ?? []).filter((p) => !exclude.includes(p.id)).sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id))).slice(0, 4);
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {list.map((p) => (
        <button key={p.id} type="button" onClick={() => onPick(p)} className="min-h-[36px] rounded-full border border-accent/40 bg-accent/5 px-3 text-xs font-semibold text-accent hover:bg-accent/10" title={`${p.roleLabel}, ${p.department}`}>
          {p.name}
        </button>
      ))}
      <button type="button" onClick={onMore} className="min-h-[36px] rounded-full border border-rule px-3 text-xs font-semibold text-muted hover:text-ink">
        {list.length ? 'Someone else…' : 'Choose a person…'}
      </button>
    </div>
  );
}

/** A VIT form generated with the student's details, with its sign spots already placed. */
function TemplateSheet({ open, initial, onClose, onMade }: { open: boolean; initial?: string | null; onClose: () => void; onMade: (r: { document: AttachmentInfo; spots: FoundSpot[]; signers: string[]; template: FormTemplate }) => void }) {
  const { data: templates } = useLive<FormTemplate[]>(open ? '/api/templates' : null, 600_000);
  const [code, setCode] = useState<string | null>(initial ?? null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setCode(initial ?? null), [initial, open]);
  const t = templates?.find((x) => x.code === code);
  async function make(e: FormEvent) {
    e.preventDefault();
    if (!t) return;
    setBusy(true);
    try {
      const r = await api<{ document: AttachmentInfo; spots: FoundSpot[]; signers: string[] }>(`/api/templates/${t.code}`, { method: 'POST', json: { values } });
      onMade({ ...r, template: t });
      onClose();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={() => !busy && onClose()}>
      {!t ? (
        <>
          <h2 className="text-lg font-bold">VIT forms</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Filled with your details, with every signature spot already marked.</p>
          <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule">
            {templates?.map((x) => (
              <li key={x.code}>
                <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-panel" onClick={() => (setCode(x.code), setValues({}))}>
                  <Icon name="file" className="h-5 w-5 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{x.name}</span>
                    <span className="block text-xs text-muted">
                      {x.format} · signed by {x.signers.join(', ')}
                    </span>
                  </span>
                  <Icon name="chevron" className="h-5 w-5 text-faint" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <form onSubmit={make} className="flex max-h-[75vh] flex-col">
          <button type="button" className="link mb-2 self-start" onClick={() => setCode(null)}>
            ← All forms
          </button>
          <h2 className="text-lg font-bold">{t.name}</h2>
          <p className="mb-4 text-xs text-muted">{t.format}</p>
          <div className="-mx-1 flex flex-col gap-3 overflow-y-auto px-1">
            {t.inputs.map((f) => (
              <label key={f.key} className="text-sm font-semibold">
                {f.label}
                {!f.required && <span className="font-normal text-faint"> (optional)</span>}
                {f.type === 'textarea' ? (
                  <textarea rows={f.key === 'members' ? 4 : 3} required={f.required} className={`${field} mt-1 font-normal`} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                ) : (
                  <input type={f.type} required={f.required} className={`${field} mt-1 font-normal`} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          <button className="cta mt-4 w-full py-4 text-base" disabled={busy}>
            {busy ? 'Preparing…' : 'Create the form'}
          </button>
        </form>
      )}
    </Sheet>
  );
}

/**
 * Send a document for signature, signed in place: the PDF, who signs in order (each "signs as" something), and
 * where on the document each of them signs. Their stored signatures land in those boxes when they sign.
 */
export default function SendDocument() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { data: docs, reload } = useLive<LibraryDocument[]>('/api/documents', 30_000);
  const [docId, setDocId] = useState<string | null>(() => params.get('docs')?.split(',')[0] ?? null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [picking, setPicking] = useState<number | null>(null);
  const [fields, setFields] = useState<SignField[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [more, setMore] = useState<SignField[]>([]);
  const [finding, setFinding] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(!!params.get('template'));
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const doc = docs?.find((d) => d.id === docId) ?? null;
  const isPdf = doc?.mime === 'application/pdf';

  // Pre-selected signer (from a teacher block), applied once.
  const preset = useRef(params.get('to'));
  useEffect(() => {
    const id = preset.current;
    if (!id) return;
    preset.current = null;
    api<Person[]>('/api/people').then((all) => {
      const p = all.find((x) => x.id === id);
      if (p) setSlots([{ label: defaultLabel(p), person: p }]);
    });
  }, []);

  // Load the chosen PDF to show it and place boxes on it.
  useEffect(() => {
    setPdf(null);
    if (!docId || !isPdf) return;
    let live = true;
    fetchBytes(`/api/attachments/${docId}`)
      .then(openPdf)
      .then((p) => live && setPdf(p))
      .catch((e) => toast(e.message));
    return () => {
      live = false;
    };
  }, [docId, isPdf]);

  const chips = slots.map((s) => ({ label: s.label || s.person?.roleLabel || 'Signer', name: s.person?.name }));

  async function find() {
    if (!pdf) return;
    const labels = slots.map((s) => s.label).filter(Boolean);
    if (!labels.length) return toast('Add who signs first, with what they sign as');
    setFinding(true);
    try {
      const spots = await findSpots(pdf, labels);
      const asField = (s: FoundSpot): SignField => ({ step: slots.findIndex((x) => x.label === s.label) + 1, page: s.page, x: s.x, y: s.y, w: s.w, h: s.h });
      const first = labels.map((l) => spots.find((s) => s.label === l)).filter(Boolean) as FoundSpot[];
      const rest = spots.filter((s) => !first.includes(s)).map(asField);
      const placed = first.map(asField).filter((f) => !fields.some((g) => g.step === f.step && g.page === f.page));
      setFields([...fields, ...placed]);
      setMore(rest);
      toast(placed.length ? `Placed ${placed.length} signature box${placed.length > 1 ? 'es' : ''}. Check them, then send.` : 'No sign spots found for these labels. Tap the page to place boxes.');
    } finally {
      setFinding(false);
    }
  }

  function pick(p: Person) {
    if (picking === null) return;
    const next = [...slots];
    next[picking] = { label: next[picking]?.label || defaultLabel(p), person: p };
    setSlots(next);
    setPicking(null);
    if (active === null) setActive(picking + 1);
  }
  function removeSlot(i: number) {
    setSlots(slots.filter((_, j) => j !== i));
    // boxes of later signers move up one step
    setFields(fields.filter((f) => f.step !== i + 1).map((f) => (f.step > i + 1 ? { ...f, step: f.step - 1 } : f)));
    setActive(null);
  }
  function moveSlot(i: number, d: -1 | 1) {
    const j = i + d;
    const next = [...slots];
    [next[i], next[j]] = [next[j], next[i]];
    setSlots(next);
    const swap = (s: number) => (s === i + 1 ? j + 1 : s === j + 1 ? i + 1 : s);
    setFields(fields.map((f) => ({ ...f, step: swap(f.step) })));
  }

  const ready = slots.filter((s) => s.person);
  const skipped = slots.filter((s) => !s.person && s.label).map((s) => s.label);
  const missing = !doc ? 'Choose the document' : !ready.length ? 'Choose who signs' : !title.trim() ? 'Give it a title' : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (missing || !doc) return toast(missing ?? '');
    setBusy(true);
    try {
      const r = await api<RequestDetail>('/api/requests', {
        method: 'POST',
        json: {
          type: 'sign_document',
          attachments: [doc.id],
          form: { title, purpose: note },
          // signers left empty are skipped; their boxes are dropped and later signers move up
          signers: ready.map((s) => ({ userId: s.person!.id, label: s.label })),
          fields: isPdf
            ? fields.flatMap((f) => {
                const slot = slots[f.step - 1];
                return slot?.person ? [{ ...f, step: ready.indexOf(slot) + 1 }] : [];
              })
            : [],
        },
      });
      toast(`Sent to ${ready[0].person!.name}${ready.length > 1 ? `, then ${ready.length - 1} more` : ''}`);
      nav(`/requests/${r.id}`, { replace: true });
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page back="/student" wide>
      <PageHeader title="Send a document for signature" subtitle="Your own form, signed in place: each person's signature lands exactly where you mark it.">
        <button type="button" className="flex min-h-[44px] items-center gap-2 rounded-xl border border-rule px-4 text-sm font-semibold transition-colors hover:bg-panel" onClick={() => setTemplateOpen(true)}>
          <Icon name="file" className="h-4 w-4" /> Start from a VIT form
        </button>
      </PageHeader>

      <form id="send-form" onSubmit={submit} className="flex flex-col gap-8 pb-28 lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-10">
        {/* The document, with the boxes */}
        <section className="order-2 lg:order-1">
          <SectionHead title="Where each person signs">
            {isPdf && pdf && (
              <button type="button" className="link inline-flex min-h-[40px] items-center gap-1.5 font-semibold" onClick={find} disabled={finding}>
                <Icon name="search" className="h-4 w-4" /> {finding ? 'Reading the form…' : 'Find sign spots'}
              </button>
            )}
          </SectionHead>
          {!doc ? (
            <div className="grid min-h-[16rem] place-items-center rounded-2xl bg-panel p-6 text-center text-sm text-muted">
              <span>
                <Icon name="file" className="mx-auto mb-2 h-7 w-7 text-faint" />
                Choose a PDF on the right, or start from a VIT form, to mark where each person signs.
              </span>
            </div>
          ) : !isPdf ? (
            <div className="rounded-2xl bg-panel p-5 text-sm text-muted">This file is an image; it is signed as a whole, and the signatures appear on the certificate page. Use a PDF to place signatures on the document itself.</div>
          ) : (
            <>
              {slots.length > 0 && (
                <div className="sticky top-[72px] z-10 -mx-1 mb-3 flex flex-wrap items-center gap-2 bg-bg/95 px-1 py-2 backdrop-blur">
                  <span className="text-xs text-muted">Tap the page to place a box for:</span>
                  {chips.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActive(active === i + 1 ? null : i + 1)}
                      className="flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold"
                      style={{ borderColor: SIGNER_COLORS[i % 6], background: active === i + 1 ? SIGNER_COLORS[i % 6] : 'transparent', color: active === i + 1 ? '#fff' : SIGNER_COLORS[i % 6] }}
                    >
                      {c.label} · {fields.filter((f) => f.step === i + 1).length}
                    </button>
                  ))}
                  {more.length > 0 && (
                    <button type="button" className="link text-xs font-semibold" onClick={() => (setFields([...fields, ...more]), setMore([]))}>
                      + {more.length} more spot{more.length > 1 ? 's' : ''} found on later pages
                    </button>
                  )}
                </div>
              )}
              <PdfSigner pdf={pdf} fields={fields} signers={chips} mode="edit" active={active} onChange={setFields} />
            </>
          )}
        </section>

        {/* Steps */}
        <aside className="order-1 flex flex-col gap-8 lg:order-2">
          <section>
            <SectionHead title="1. Document" />
            <DocumentLibrary docs={docs} onChanged={reload} selected={docId ? [docId] : []} onSelect={(ids) => (setDocId(ids.filter((x) => x !== docId)[0] ?? null), setFields([]), setMore([]))} compact />
          </section>

          <section>
            <SectionHead title="2. Who signs, in order" />
            {slots.length > 0 && (
              <ol className="mb-2 flex flex-col gap-2">
                {slots.map((s, i) => (
                  <li key={i} className="rounded-xl border border-rule p-3" style={{ borderLeftColor: SIGNER_COLORS[i % 6], borderLeftWidth: 4 }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted">{i + 1}</span>
                      {s.person ? (
                        <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:text-accent" onClick={() => setPicking(i)} title="Change">
                          {s.person.name}
                        </button>
                      ) : (
                        <span className="min-w-0 flex-1 text-sm font-semibold text-warn">Who signs as {s.label || 'this'}?</span>
                      )}
                      <button type="button" className="px-1 text-muted disabled:opacity-30" disabled={i === 0} onClick={() => moveSlot(i, -1)} aria-label="Move up">
                        ↑
                      </button>
                      <button type="button" className="px-1 text-muted disabled:opacity-30" disabled={i === slots.length - 1} onClick={() => moveSlot(i, 1)} aria-label="Move down">
                        ↓
                      </button>
                      <button type="button" className="px-1 text-xs text-faint hover:text-bad" onClick={() => removeSlot(i)}>
                        Remove
                      </button>
                    </div>
                    {!s.person && (
                      <Suggestions
                        label={s.label}
                        exclude={slots.map((x) => x.person?.id ?? '')}
                        onPick={(p) => {
                          setSlots(slots.map((x, j) => (j === i ? { ...x, person: p } : x)));
                          if (active === null) setActive(i + 1);
                        }}
                        onMore={() => setPicking(i)}
                      />
                    )}
                    <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                      Signs as
                      <input list="sign-as" className="min-w-0 flex-1 rounded-lg border border-rule px-2 py-1.5 text-sm text-ink outline-none focus:border-accent" value={s.label} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    </label>
                  </li>
                ))}
              </ol>
            )}
            <datalist id="sign-as">
              {LABELS.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
            {slots.length < 6 && (
              <button type="button" className="link inline-flex min-h-[44px] items-center gap-1.5 font-semibold" onClick={() => (setSlots([...slots, { label: '', person: null }]), setPicking(slots.length))}>
                <Icon name="plus" className="h-4 w-4" /> Add a signer
              </button>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <SectionHead title="3. What is it?" />
            <label className="text-sm font-semibold" htmlFor="send-title">
              Title
            </label>
            <input id="send-title" required maxLength={200} className={field} placeholder="e.g. FF 180 Project Registration" value={title} onChange={(e) => setTitle(e.target.value)} />
            <label className="mt-1 text-sm font-semibold" htmlFor="send-note">
              Note for the signers <span className="font-normal text-faint">(optional)</span>
            </label>
            <textarea id="send-note" rows={2} className={`${field} resize-none`} placeholder="Anything they should know before signing" value={note} onChange={(e) => setNote(e.target.value)} />
          </section>

        </aside>
      </form>

      {/* Always on screen: who it goes to, in order, and Send */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="min-w-0 text-sm">
            {ready.length ? (
              <p className="truncate">
                <span className="text-muted">Goes to </span>
                <b>{ready.map((s) => `${s.person!.name} (${s.label || s.person!.roleLabel})`).join(' → ')}</b>
              </p>
            ) : (
              <p className="text-muted">Choose the document and who signs it.</p>
            )}
            <p className="truncate text-xs text-faint">
              {skipped.length ? `Not sending to: ${skipped.join(', ')} (their box stays empty) · ` : ''}
              {fields.length} signature box{fields.length === 1 ? '' : 'es'} placed
            </p>
          </div>
          <button type="submit" form="send-form" className="cta shrink-0 px-6 py-3 text-base" disabled={busy || !!missing}>
            <Icon name="send" className="mr-2 h-4 w-4" />
            {busy ? 'Sending…' : (missing ?? `Send to ${ready[0].person!.name.split(' ').slice(-1)[0]}${ready.length > 1 ? ` + ${ready.length - 1}` : ''}`)}
          </button>
        </div>
      </div>

      <Sheet open={picking !== null} onClose={() => (picking !== null && !slots[picking]?.person && !slots[picking]?.label ? setSlots(slots.filter((_, j) => j !== picking)) : undefined, setPicking(null))}>
        <h2 className="mb-3 text-lg font-bold">{picking !== null && slots[picking]?.label ? `Who signs as ${slots[picking].label}?` : 'Who signs?'}</h2>
        <PeoplePicker onPick={pick} exclude={slots.map((s) => s.person?.id ?? '')} />
      </Sheet>

      <TemplateSheet
        open={templateOpen}
        initial={params.get('template')}
        onClose={() => setTemplateOpen(false)}
        onMade={({ document, spots, signers, template }) => {
          reload();
          setDocId(document.id);
          // the form's signers become the slots (keeping anyone already chosen for the same role)
          const next: Slot[] = signers.map((label) => slots.find((s) => s.label === label) ?? { label, person: null });
          setSlots(next);
          setFields(spots.map((s) => ({ step: signers.indexOf(s.label) + 1, page: s.page, x: s.x, y: s.y, w: s.w, h: s.h })).filter((f) => f.step > 0));
          setMore([]);
          if (!title) setTitle(`${template.format} ${template.name}`);
          toast(`${template.name} is ready with ${spots.length} signature spots. Choose who signs; remove anyone not needed.`);
        }}
      />
    </Page>
  );
}
