import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLE_LABEL, type AttachmentInfo, type FormTemplate, type RequestDetail, type RequestType, type Role } from '@plc/shared';
import { useLive } from '../lib/hooks';
import { AttachmentPicker } from '../components/Attachments';
import { Page, PageHeader, SectionHead, toast } from '../components/ui';
import { Icon } from '../components/Icon';
import { FormFields, type FormValues } from '../components/FormFields';
import { api } from '../lib/api';

const BLURB: Record<string, string> = {
  event_permission: 'Fest, club event, guest talk',
  on_duty: 'Miss class for a college activity',
  bonafide: 'Proof you study here',
  no_dues: 'Library, labs, hostel, accounts at once',
  document_signature: 'Send files to anyone to sign',
  sign_document: 'Any PDF: choose who signs and mark where',
};

/** Designations a student can ask to sign a custom request, in the order they are offered. */
const SIGNERS: Role[] = ['faculty', 'faculty_coordinator', 'hod', 'dean_sa', 'librarian', 'lab_incharge', 'warden', 'accounts', 'security'];
const MAX_SIGNERS = 6;

/** "Faculty coordinator → HoD ‖ Security → Dean SA" for a type's chain (same step = in parallel). */
const chainText = (chain: RequestType['chain']) =>
  [...new Set(chain.map((s) => s.stepNo))].map((n) => chain.filter((s) => s.stepNo === n).map((s) => ROLE_LABEL[s.role]).join(' ‖ ')).join(' → ');

/** Pick the people who sign a custom request, in order. */
function SignerChain({ value, onChange }: { value: Role[]; onChange: (v: Role[]) => void }) {
  const left = SIGNERS.filter((r) => !value.includes(r));
  const move = (i: number, d: -1 | 1) => {
    const v = [...value];
    [v[i], v[i + d]] = [v[i + d], v[i]];
    onChange(v);
  };
  return (
    <section className="mt-5">
      <p className="mb-1 text-sm font-semibold">Who signs, in order</p>
      <p className="mb-3 text-xs text-faint">Each is the person with that designation in your department (your connected teacher first). They sign one after another.</p>
      {value.length > 0 && (
        <ol className="mb-3 flex flex-col gap-2">
          {value.map((r, i) => (
            <li key={r} className="flex items-center gap-3 rounded-xl border border-rule bg-panel px-3 py-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-accent text-xs font-bold text-accent">{i + 1}</span>
              <span className="flex-1 font-semibold">{ROLE_LABEL[r]}</span>
              <button type="button" className="px-1.5 text-muted disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                ↑
              </button>
              <button type="button" className="px-1.5 text-muted disabled:opacity-30" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                ↓
              </button>
              <button type="button" className="px-1.5 text-xs text-faint hover:text-bad" onClick={() => onChange(value.filter((x) => x !== r))}>
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
      {value.length < MAX_SIGNERS && left.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {left.map((r) => (
            <button key={r} type="button" className="rounded-full border border-dashed border-accent px-3 py-1.5 text-sm font-semibold text-accent" onClick={() => onChange([...value, r])}>
              + {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function NewRequest() {
  const nav = useNavigate();
  const [types, setTypes] = useState<RequestType[]>([]);
  const { data: templates } = useLive<FormTemplate[]>('/api/templates', 600_000);
  const [type, setType] = useState<RequestType | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [files, setFiles] = useState<AttachmentInfo[]>([]);
  const [signers, setSigners] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);
  const custom = type?.code === 'custom';

  useEffect(() => {
    api<RequestType[]>('/api/request-types').then(setTypes).catch((e) => toast(e.message));
  }, []);

  function pick(t: RequestType) {
    if (t.code === 'document_signature' || t.code === 'sign_document') return nav('/student/send');
    setType(t);
    setValues({});
    setFiles([]);
    setSigners([]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!type) return;
    if (custom && !signers.length) return toast('Add at least one person to sign');
    setBusy(true);
    try {
      const r = await api<RequestDetail>('/api/requests', {
        method: 'POST',
        json: { type: type.code, form: values, attachments: files.map((f) => f.id), ...(custom ? { chain: signers } : {}) },
      });
      nav(`/requests/${r.id}`, { replace: true });
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!type) {
    const own = types.find((t) => t.code === 'custom');
    const row = 'group flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-panel md:px-5';
    return (
      <Page back="/student">
        <PageHeader title="What do you need?" subtitle="Pick a form, or write your own and choose who signs it." />
        <div className="flex flex-col gap-8">
          {own && (
            <button onClick={() => pick(own)} className={`${row} rounded-2xl border border-accent/30 bg-accent/5 hover:bg-accent/10`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-white">
                <Icon name="pen" className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-accent">Write your own request</span>
                <span className="block text-sm text-muted">Describe what you need and choose who signs it, in order</span>
              </span>
              <Icon name="chevron" className="h-5 w-5 text-accent" />
            </button>
          )}
          {/* VIT forms: generated with my details, sign spots already placed, then sent for signature */}
          <section>
            <SectionHead title="VIT forms, signed in place" />
            <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule">
              {templates?.map((t) => (
                <li key={t.code}>
                  <button onClick={() => nav(`/student/send?template=${t.code}`)} className={row}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-panel text-muted transition-colors group-hover:text-accent">
                      <Icon name="pen" className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{t.name}</span>
                      <span className="block text-sm text-muted">{t.format}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-faint">Signed by: {t.signers.join(' → ')}</span>
                    </span>
                    <Icon name="chevron" className="h-5 w-5 text-faint transition-colors group-hover:text-accent" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <SectionHead title="Ready-made forms" />
            <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule">
              {types
                .filter((t) => t.code !== 'custom' && t.code !== 'document_signature')
                .map((t) => (
                  <li key={t.code}>
                    <button onClick={() => pick(t)} className={row}>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-panel text-muted transition-colors group-hover:text-accent">
                        <Icon name={t.code === 'document_signature' ? 'send' : 'file'} className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{t.name}</span>
                        <span className="block text-sm text-muted">{BLURB[t.code] ?? ''}</span>
                        {t.chain.length > 0 && t.code !== 'document_signature' && <span className="mt-0.5 block text-xs leading-snug text-faint">Goes to: {chainText(t.chain)}</span>}
                      </span>
                      <Icon name="chevron" className="h-5 w-5 text-faint transition-colors group-hover:text-accent" />
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      </Page>
    );
  }

  return (
    <Page back="/student">
      <button className="link mb-1 self-start" onClick={() => setType(null)}>
        Change form
      </button>
      <h1 className="mb-1 text-2xl font-bold">{custom ? 'Your own request' : type.name}</h1>
      {!custom && type.chain.length > 0 && <p className="mb-5 text-sm text-muted">Goes to: {chainText(type.chain)}</p>}
      <form onSubmit={submit} className={`flex flex-1 flex-col ${custom ? 'mt-4' : ''}`}>
        <FormFields fields={type.fields} values={values} onChange={setValues} />
        {custom && <SignerChain value={signers} onChange={setSigners} />}
        <div className="mt-4">
          <AttachmentPicker value={files} onChange={setFiles} />
        </div>
        <div className="mt-auto pt-8 md:mt-0">
          <button className="cta w-full" disabled={busy || (custom && !signers.length)}>
            {busy ? 'Submitting…' : custom && signers.length ? `Send to ${ROLE_LABEL[signers[0]]} first` : 'Submit for approval'}
          </button>
        </div>
      </form>
    </Page>
  );
}
