import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ROLE_LABEL, type RequestDetail, type RequestType } from '@plc/shared';
import { Page, toast } from '../components/ui';
import { FormFields, type FormValues } from '../components/FormFields';
import { api } from '../lib/api';

const asValues = (form: Record<string, string | number>) => Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v)]));

/** Amend a sealed approval: same request, new version; only affected approvers sign again. */
export default function AmendPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [r, setR] = useState<RequestDetail | null>(null);
  const [type, setType] = useState<RequestType | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api<RequestDetail>(`/api/requests/${id}`), api<RequestType[]>('/api/request-types')])
      .then(([req, types]) => {
        setR(req);
        setType(types.find((t) => t.code === req.type) ?? null);
        setValues(asValues(req.form));
      })
      .catch((e) => toast(e.message));
  }, [id]);

  const original = useMemo(() => (r ? asValues(r.form) : {}), [r]);
  const changed = Object.keys({ ...original, ...values }).filter((k) => (original[k] ?? '') !== (values[k] ?? ''));
  const back = type?.chain.filter((s) => s.affectedBy.some((f) => changed.includes(f))) ?? [];
  const kept = type?.chain.filter((s) => !back.includes(s)) ?? [];
  const names = (steps: { role: keyof typeof ROLE_LABEL }[]) => steps.map((s) => ROLE_LABEL[s.role]).join(', ');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!r) return;
    setBusy(true);
    try {
      const changes = Object.fromEntries(changed.map((k) => [k, values[k]]));
      await api(`/api/requests/${r.id}/amend`, { method: 'POST', json: { changes, reason } });
      toast(`Amendment sent to ${names(back)}`);
      nav(`/requests/${r.id}`, { replace: true });
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!r || !type) return <Page back={`/requests/${id}`}>{null}</Page>;

  return (
    <Page back={`/requests/${r.id}`}>
      <p className="font-mono text-xs uppercase tracking-wide text-faint">
        {r.typeName} · {r.id} · v{r.version} → v{r.version + 1}
      </p>
      <h1 className="mb-1 text-2xl font-bold">Amend approval</h1>
      <p className="mb-5 text-sm text-muted">Change what moved. v{r.version} stays valid until the new version is sealed.</p>
      <form onSubmit={submit} className="flex flex-1 flex-col">
        <FormFields fields={type.fields} values={values} onChange={setValues} original={original} />
        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-semibold">Why did it change?</span>
          <textarea
            rows={2}
            required
            className="w-full rounded-xl border border-rule px-4 py-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="e.g. Hall B under repair, moved to Main Auditorium"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="mt-auto pt-8 md:mt-0">
          <p className="mb-3 min-h-[2.5rem] rounded-xl bg-panel px-4 py-3 text-sm">
            {changed.length === 0 ? (
              <span className="text-muted">Change a field to see who needs to sign again.</span>
            ) : (
              <>
                <span className="font-semibold">Goes back to:</span> {names(back) || 'nobody'}
                {kept.length > 0 && (
                  <>
                    {' · '}
                    <span className="font-semibold">Kept:</span> {names(kept)}
                  </>
                )}
              </>
            )}
          </p>
          <button className="cta w-full" disabled={busy || changed.length === 0 || !reason.trim()}>
            {busy ? 'Sending…' : 'Send amendment'}
          </button>
        </div>
      </form>
    </Page>
  );
}
