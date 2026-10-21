import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Connection, LibraryDocument, Person, RequestDetail, RequestSummary } from '@plc/shared';
import { Page, toast } from '../components/ui';
import { DocumentLibrary } from '../components/DocumentLibrary';
import { PersonBlock } from '../components/PersonBlock';
import { api } from '../lib/api';
import { useLive } from '../lib/hooks';
import { Icon } from '../components/Icon';

type Tab = 'all' | 'staff' | 'student';

/** Send documents to anyone (staff or another student) to sign. Sealed and verifiable like every request. */
export default function SendDocument() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { data: docs, reload } = useLive<LibraryDocument[]>('/api/documents', 30_000);
  const { data: conns } = useLive<Connection[]>('/api/connections', 30_000);
  const { data: mine } = useLive<RequestSummary[]>('/api/requests/mine', 60_000);
  // Autocomplete from what this student typed before; nothing is pre-set.
  const pastTitles = [...new Set((mine ?? []).filter((r) => r.type === 'document_signature').map((r) => r.title))];
  const [selected, setSelected] = useState<string[]>(() => (params.get('docs') ? params.get('docs')!.split(',') : []));
  const [to, setTo] = useState<Person | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Pre-selected recipient (from a teacher block), applied once so "Change" can clear it.
  const preset = useRef(params.get('to'));
  useEffect(() => {
    const id = preset.current;
    if (!id) return;
    preset.current = null;
    api<Person[]>('/api/people').then((all) => setTo(all.find((p) => p.id === id) ?? null)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const kind = tab === 'all' ? '' : `&kind=${tab}`;
      api<Person[]>(`/api/people?q=${encodeURIComponent(q)}${kind}`).then(setPeople).catch(() => setPeople([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, tab]);

  const teacherIds = new Set(conns?.filter((c) => c.status === 'accepted').map((c) => c.person.id));
  const sorted = [...(people ?? [])].sort((a, b) => Number(teacherIds.has(b.id)) - Number(teacherIds.has(a.id)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!to) return toast('Pick who to send it to');
    if (!selected.length) return toast('Pick at least one document');
    setBusy(true);
    try {
      const r = await api<RequestDetail>('/api/requests', {
        method: 'POST',
        json: { type: 'document_signature', recipientId: to.id, attachments: selected, form: { title, purpose: note } },
      });
      toast(`Sent to ${to.name}`);
      nav(`/requests/${r.id}`, { replace: true });
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page back="/student" wide>
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">Send a document</h1>
      <form onSubmit={submit} className="flex flex-col gap-8 lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-10">
        <div className="flex flex-col gap-8">
          {/* 1. To */}
          <section>
            <h2 className="mb-3 text-base font-semibold">To</h2>
            {to ? (
              <div className="max-w-sm">
                <PersonBlock p={to}>
                  <button type="button" className="link text-sm" onClick={() => setTo(null)}>
                    Change
                  </button>
                </PersonBlock>
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="flex gap-1 rounded-xl bg-panel p-1">
                    {(['all', 'staff', 'student'] as Tab[]).map((t) => (
                      <button type="button" key={t} onClick={() => setTab(t)} className={`min-h-[40px] rounded-lg px-3 text-sm font-semibold ${tab === t ? 'bg-bg shadow-sm' : 'text-muted hover:text-ink'}`}>
                        {t === 'all' ? 'All' : t === 'staff' ? 'Staff' : 'Students'}
                      </button>
                    ))}
                  </div>
                  <label className="relative block min-w-[12rem] flex-1">
                    <span className="sr-only">Search people</span>
                    <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                    <input
                      className="w-full rounded-xl border border-rule py-2.5 pl-10 pr-4 outline-none focus:border-accent"
                      placeholder="Name, designation or department"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                  </label>
                </div>
                <div className="grid max-h-[28rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                  {sorted.map((p) => (
                    <button type="button" key={p.id} className="text-left" onClick={() => setTo(p)}>
                      <PersonBlock p={p}>{teacherIds.has(p.id) && <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok"><Icon name="check" className="h-4 w-4" /> Your teacher</span>}</PersonBlock>
                    </button>
                  ))}
                  {people && people.length === 0 && <p className="text-sm text-faint">Nobody matches.</p>}
                </div>
              </>
            )}
          </section>

          {/* 3. What */}
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">What is it?</h2>
            <label className="text-sm font-semibold" htmlFor="send-title">
              Title
            </label>
            <input
              id="send-title"
              required
              list="past-titles"
              maxLength={200}
              className="w-full rounded-xl border border-rule px-4 py-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="e.g. Internship completion letter"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <datalist id="past-titles">
              {pastTitles.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <label className="mt-1 text-sm font-semibold" htmlFor="send-note">
              Note for the recipient <span className="font-normal text-faint">(optional)</span>
            </label>
            <textarea
              id="send-note"
              rows={2}
              className="w-full resize-none rounded-xl border border-rule px-4 py-3 outline-none focus:border-accent"
              placeholder="Anything they should know before signing"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </section>
        </div>

        {/* 2. Documents + send */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-6">
          <h2 className="text-base font-semibold">Documents ({selected.length} selected)</h2>
          <DocumentLibrary docs={docs} onChanged={reload} selected={selected} onSelect={setSelected} compact />
          <button className="cta w-full" disabled={busy || !to || !selected.length || !title.trim()}>
            {/* The label says what is still missing, so the disabled state explains itself */}
            {busy ? 'Sending…' : !to ? 'Choose who to send it to' : !selected.length ? 'Add a document' : !title.trim() ? 'Give it a title' : `Send to ${to.name}`}
          </button>
          <p className="text-center text-xs text-faint">They sign with their PIN; the signed result is recorded on chain and verifiable.</p>
        </aside>
      </form>
    </Page>
  );
}
