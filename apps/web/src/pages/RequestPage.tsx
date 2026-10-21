import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ROLE_LABEL, type RequestDetail } from '@plc/shared';
import { Page, StatusPill, toast } from '../components/ui';
import { Timeline } from '../components/Timeline';
import { FieldList, FormFields, type FormValues } from '../components/FormFields';
import { api } from '../lib/api';
import { useLive } from '../lib/hooks';
import { useSession } from '../lib/session';

export default function RequestPage() {
  const { id } = useParams();
  const { me } = useSession();
  const { data: r, error, reload } = useLive<RequestDetail>(`/api/requests/${id}`);
  const [editing, setEditing] = useState<FormValues | null>(null);
  const [busy, setBusy] = useState(false);
  const back = me?.roles.includes('student') ? '/student' : me?.roles.includes('admin') ? '/admin' : '/inbox';

  if (error) return <Page back={back}><p className="text-bad">{error}</p></Page>;
  if (!r) return <Page back={back} wide>{null}</Page>;

  const mine = r.student.id === me?.id;

  async function resubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/requests/${r!.id}/resubmit`, { method: 'POST', json: { form: editing } });
      setEditing(null);
      toast('Sent back for approval');
      reload();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (editing)
    return (
      <Page back={back}>
        <button className="link mb-1 self-start" onClick={() => setEditing(null)}>
          Cancel
        </button>
        <h1 className="mb-5 text-2xl font-bold">Edit and resubmit</h1>
        <form onSubmit={resubmit} className="flex flex-1 flex-col">
          <FormFields fields={r.fields} values={editing} onChange={setEditing} />
          <div className="mt-auto pt-8 md:mt-0">
            <button className="cta w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Resubmit for approval'}
            </button>
          </div>
        </form>
      </Page>
    );

  return (
    <Page back={back} wide>
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-12">
      <div>
      <p className="font-mono text-xs uppercase tracking-wide text-faint">
        {r.typeName} · {r.id}
      </p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold md:text-3xl">{r.title}</h1>
        <StatusPill status={r.status} />
      </div>
      {!mine && <p className="text-sm text-muted">{r.student.name} · {r.student.title}</p>}

      <div className="my-5 rounded-2xl bg-panel p-4">
        <FieldList fields={r.fields} form={r.form} />
      </div>

      {mine && r.status === 'returned' && (
        <section className="mb-6 flex flex-col items-center gap-3 rounded-2xl border border-warn/30 bg-warn-bg p-5 text-center">
          {r.lastComment && (
            <p className="text-sm">
              <span className="font-semibold">{ROLE_LABEL[r.lastComment.role]}:</span> “{r.lastComment.comment}”
            </p>
          )}
          <button className="cta w-full" onClick={() => setEditing(Object.fromEntries(Object.entries(r.form).map(([k, v]) => [k, String(v)])))}>
            Edit and resubmit
          </button>
        </section>
      )}

      {mine && r.status === 'approved' && (
        <section className="mb-6 flex flex-col items-center gap-2">
          <button className="cta w-full" disabled title="Available once the document is sealed">
            Download PDF
          </button>
          <p className="text-xs text-faint">Sealing on chain comes next.</p>
        </section>
      )}

      {r.status === 'rejected' && r.lastComment && (
        <p className="mb-6 rounded-2xl bg-bad-bg p-4 text-sm text-bad">
          <span className="font-semibold">Rejected by {ROLE_LABEL[r.lastComment.role]}:</span> “{r.lastComment.comment}”
        </p>
      )}

      </div>
      <section className="lg:rounded-3xl lg:border lg:border-rule lg:p-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Approval chain</h2>
        <Timeline steps={r.timeline} done={r.status === 'approved'} />
      </section>
      </div>
    </Page>
  );
}
