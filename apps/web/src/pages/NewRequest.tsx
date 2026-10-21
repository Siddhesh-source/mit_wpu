import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AttachmentInfo, RequestDetail, RequestType } from '@plc/shared';
import { AttachmentPicker } from '../components/Attachments';
import { Page, toast } from '../components/ui';
import { FormFields, type FormValues } from '../components/FormFields';
import { api } from '../lib/api';

const BLURB: Record<string, string> = {
  event_permission: 'Fest, club event, guest talk',
  on_duty: 'Miss class for a college activity',
  bonafide: 'Proof you study here',
  no_dues: 'Library, labs, hostel, accounts at once',
};

export default function NewRequest() {
  const nav = useNavigate();
  const [types, setTypes] = useState<RequestType[]>([]);
  const [type, setType] = useState<RequestType | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [files, setFiles] = useState<AttachmentInfo[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<RequestType[]>('/api/request-types').then(setTypes).catch((e) => toast(e.message));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!type) return;
    setBusy(true);
    try {
      const r = await api<RequestDetail>('/api/requests', { method: 'POST', json: { type: type.code, form: values, attachments: files.map((f) => f.id) } });
      nav(`/requests/${r.id}`, { replace: true });
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!type)
    return (
      <Page back="/student" wide>
        <h1 className="mb-4 text-2xl font-bold md:mb-8 md:text-3xl">What do you need?</h1>
        <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-4">
          {types.map((t) => (
            <button key={t.code} onClick={() => (setType(t), setValues({}), setFiles([]))} className="rounded-2xl border border-rule bg-panel p-5 text-left hover:border-accent/40 active:bg-rule md:p-8">
              <p className="text-lg font-semibold">{t.name}</p>
              <p className="text-sm text-muted">{BLURB[t.code] ?? ''}</p>
            </button>
          ))}
        </div>
      </Page>
    );

  return (
    <Page back="/student">
      <button className="link mb-1 self-start" onClick={() => setType(null)}>
        Change form
      </button>
      <h1 className="mb-5 text-2xl font-bold">{type.name}</h1>
      <form onSubmit={submit} className="flex flex-1 flex-col">
        <FormFields fields={type.fields} values={values} onChange={setValues} />
        <div className="mt-4">
          <AttachmentPicker value={files} onChange={setFiles} />
        </div>
        <div className="mt-auto pt-8 md:mt-0">
          <button className="cta w-full" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit for approval'}
          </button>
        </div>
      </form>
    </Page>
  );
}
