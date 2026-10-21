import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ROLE_LABEL, type RequestDetail, type VersionHistory } from '@plc/shared';
import { Page, PinPad, Sheet, StatusPill, Tick, toast } from '../components/ui';
import { VersionStrip } from '../components/VersionStrip';
import { AttachmentList, AttachmentPicker } from '../components/Attachments';
import type { AttachmentInfo } from '@plc/shared';
import { Timeline } from '../components/Timeline';
import { FieldList, FormFields, type FormValues } from '../components/FormFields';
import { api, download } from '../lib/api';
import { fmtDate, useLive } from '../lib/hooks';
import { useSession } from '../lib/session';

export default function RequestPage() {
  const { id } = useParams();
  const { me } = useSession();
  const { data: r, error, reload } = useLive<RequestDetail>(`/api/requests/${id}`);
  const { data: versions, reload: reloadVersions } = useLive<VersionHistory[]>(`/api/requests/${id}/history`, 8000);
  const [editing, setEditing] = useState<FormValues | null>(null);
  const [newFiles, setNewFiles] = useState<AttachmentInfo[]>([]);
  const [revoking, setRevoking] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [resetPin, setResetPin] = useState(0);
  const [busy, setBusy] = useState(false);
  const back = me?.roles.includes('student') ? '/student' : me?.roles.includes('admin') ? '/admin' : '/inbox';

  if (error) return <Page back={back}><p className="text-bad">{error}</p></Page>;
  if (!r) return <Page back={back} wide>{null}</Page>;

  const mine = r.student.id === me?.id;
  const finished = r.status === 'approved' || r.status === 'sealing' || r.status === 'sealed';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const canAmend = mine && r.status === 'sealed' && !(r.type === 'event_permission' && String(r.form.date) < today);
  const canRevoke = !!me?.roles.some((x) => x === 'hod' || x === 'dean_sa') && (r.status === 'sealed' || r.status === 'amending');

  async function revoke(pin: string) {
    if (!revokeReason.trim()) {
      toast('Give a reason for the record');
      setResetPin((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/requests/${r!.id}/revoke`, { method: 'POST', json: { reason: revokeReason, pin } });
      setRevoking(false);
      setRevokeReason('');
      toast('Revoked. Every copy now verifies as Revoked. Tell Security to sync the gate list.');
      reload();
      reloadVersions();
    } catch (e) {
      toast((e as Error).message);
      setResetPin((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  const amendReturned = r.status === 'sealed' && r.lastComment && r.lastComment.version > r.version && r.lastComment.decision !== 'approved' ? r.lastComment : null;
  const getPdf = () => download(`/api/requests/${r.id}/pdf`, `${r.id}-v${r.seal?.version ?? 1}.pdf`).catch((e) => toast(e.message));

  async function resubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/requests/${r!.id}/resubmit`, { method: 'POST', json: { form: editing, attachments: newFiles.map((f) => f.id) } });
      setEditing(null);
      setNewFiles([]);
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
          <div className="mt-4 flex flex-col gap-2">
            <AttachmentList items={r.attachments} />
            <AttachmentPicker value={newFiles} onChange={setNewFiles} max={Math.max(0, 5 - r.attachments.length)} />
          </div>
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

      {r.revocation && (
        <p className="mt-4 rounded-2xl bg-bad-bg p-4 text-sm text-bad">
          <span className="font-semibold">
            Revoked by {r.revocation.roleLabel} ({r.revocation.name}) on {fmtDate(r.revocation.at)}:
          </span>{' '}
          “{r.revocation.reason}”
          <br />
          <span className="text-ink/70">Every version of this approval now verifies as Revoked.</span>
        </p>
      )}
      {r.status === 'amending' && r.amendment && (
        <p className="mt-4 rounded-2xl bg-warn-bg p-4 text-sm">
          <span className="font-semibold text-warn">Amendment v{r.version} in review</span> · {r.amendment.reason}
          <br />
          <span className="text-muted">v{r.amendment.fromVersion} stays valid until v{r.version} is sealed. Only the approvers affected by the change sign again.</span>
        </p>
      )}
      {amendReturned && (
        <p className="mt-4 rounded-2xl bg-warn-bg p-4 text-sm">
          <span className="font-semibold text-warn">
            Your amendment (v{amendReturned.version}) was {amendReturned.decision} by {ROLE_LABEL[amendReturned.role]}:
          </span>{' '}
          “{amendReturned.comment}” <span className="text-muted">v{r.version} is still valid.</span>
        </p>
      )}

      <div className="my-5 rounded-2xl bg-panel p-4">
        <FieldList fields={r.fields} form={r.form} previous={r.status === 'amending' ? r.amendment?.previous : undefined} />
      </div>
      {r.attachments.length > 0 && (
        <div className="-mt-2 mb-5">
          <AttachmentList items={r.attachments} />
        </div>
      )}

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

      {(finished || r.seal) && (
        <section className="mb-6 flex flex-col items-center gap-3">
          {mine && r.status !== 'revoked' ? (
            <>
              <button className="cta w-full" disabled={!r.seal} onClick={getPdf}>
                {r.seal ? (r.status === 'amending' ? `Download v${r.seal.version} PDF (still valid)` : 'Download PDF') : 'Preparing PDF…'}
              </button>
              {canAmend && (
                <Link to={`/requests/${r.id}/amend`} className="w-full rounded-xl border-2 border-ink py-4 text-center text-lg font-semibold active:scale-[0.98]">
                  Amend
                </Link>
              )}
            </>
          ) : (
            r.seal && (
              <button className="link text-base" onClick={getPdf}>
                {r.status === 'revoked' ? 'Download PDF (revoked, for records)' : 'Download sealed PDF'}
              </button>
            )
          )}
          {r.status === 'revoked' ? null : r.seal?.anchor === 'anchored' ? (
            <p className="flex items-center gap-2 text-sm text-ok">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-ok text-white"><Tick className="h-3 w-3" /></span>
              Sealed on chain · v{r.seal.version}
              {r.seal.txUrl ? (
                <a className="link font-mono text-xs" href={r.seal.txUrl} target="_blank" rel="noreferrer">
                  {r.seal.txHash!.slice(0, 10)}…
                </a>
              ) : (
                <span className="font-mono text-xs text-faint">{r.seal.txHash?.slice(0, 10)}…</span>
              )}
            </p>
          ) : (
            r.seal && <p className="text-sm text-muted">Sealing on chain… the PDF is ready; verification turns on once it lands.</p>
          )}
        </section>
      )}

      {r.status === 'rejected' && r.lastComment && (
        <p className="mb-6 rounded-2xl bg-bad-bg p-4 text-sm text-bad">
          <span className="font-semibold">Rejected by {ROLE_LABEL[r.lastComment.role]}:</span> “{r.lastComment.comment}”
        </p>
      )}

      {versions && versions.length > 1 && <VersionStrip requestId={r.id} versions={versions} onError={toast} />}

      {canRevoke && (
        <button className="mb-6 text-sm font-semibold text-bad underline-offset-4 hover:underline" onClick={() => setRevoking(true)}>
          Revoke approval
        </button>
      )}
      </div>
      <section className="lg:rounded-3xl lg:border lg:border-rule lg:p-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Approval chain</h2>
        {r.version > 1 && <p className="mb-3 text-xs text-faint">Showing v{r.version}. Carried approvals were signed on an earlier version and still apply.</p>}
        <Timeline steps={r.timeline} done={finished && (r.status === 'sealed' ? 'sealed' : 'approved')} />
      </section>
      </div>

      <Sheet open={revoking} onClose={() => !busy && setRevoking(false)}>
        <h2 className="text-lg font-bold text-bad">Revoke “{r.title}”?</h2>
        <p className="mt-1 text-sm text-muted">Cancels the approval entirely. Every copy, old or new, will verify as Revoked. This cannot be undone.</p>
        <textarea
          rows={2}
          placeholder="Reason (required, kept in the record)"
          className="my-4 w-full rounded-xl border border-rule px-4 py-3 outline-none focus:border-bad"
          value={revokeReason}
          onChange={(e) => setRevokeReason(e.target.value)}
        />
        <p className="mb-3 text-center text-sm text-muted">Enter your PIN to revoke</p>
        <PinPad onComplete={revoke} busy={busy} reset={resetPin} />
      </Sheet>
    </Page>
  );
}
