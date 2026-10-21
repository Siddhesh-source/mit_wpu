import { useEffect, useState, type FormEvent } from 'react';
import { ROLE_LABEL, homeFor } from '@plc/shared';
import { Page, toast } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { MySignature } from '../components/SignaturePad';

const input = 'w-full rounded-xl border border-rule bg-bg px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

/** Edit your own details. Department, designation and email stay as signed up. */
export default function Profile() {
  const { me, refresh } = useSession();
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (me) setF({ name: me.name, title: me.title, phone: me.phone ?? '', employeeId: me.employeeId ?? '', rollNo: me.rollNo ?? '', year: me.year ?? '', bio: me.bio ?? '' });
  }, [me]);
  if (!me) return null;
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/me', { method: 'PUT', json: f });
      await refresh();
      toast('Profile saved');
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const row = (label: string, key: string, extra: Record<string, unknown> = {}) => (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {key === 'bio' ? <textarea className={input} rows={3} value={f[key] ?? ''} onChange={set(key)} /> : <input className={input} value={f[key] ?? ''} onChange={set(key)} {...extra} />}
    </label>
  );

  return (
    <Page back={homeFor(me.roles)}>
      <div className="mb-6 flex items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-xl font-semibold text-white">{me.initials}</span>
        <div>
          <h1 className="text-2xl font-bold">{me.name}</h1>
          <p className="text-sm text-muted">
            {me.roles.map((r) => ROLE_LABEL[r]).join(' · ')} · {me.department}
          </p>
          <p className="text-xs text-faint">{me.email}</p>
        </div>
      </div>
      <div className="mb-8 rounded-2xl border border-rule p-4">
        <MySignature />
      </div>
      <form onSubmit={save} className="flex flex-col gap-4">
        {row('Full name', 'name', { required: true })}
        {row('Title', 'title')}
        {me.kind === 'student' ? (
          <div className="grid grid-cols-2 gap-3">
            {row('Roll number', 'rollNo')}
            {row('Year', 'year')}
          </div>
        ) : (
          row('Employee ID', 'employeeId')
        )}
        {row('Phone', 'phone', { type: 'tel' })}
        {row('About', 'bio')}
        <button className="cta mt-2 w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </Page>
  );
}
