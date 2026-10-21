import type { FieldDef } from '@plc/shared';
import { fmtDay } from '../lib/hooks';

export type FormValues = Record<string, string>;

const input = 'w-full rounded-xl border border-rule bg-bg px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

export function FormFields({ fields, values, onChange, original }: { fields: FieldDef[]; values: FormValues; onChange: (v: FormValues) => void; original?: FormValues }) {
  return (
    <div className="flex flex-col gap-4">
      {fields.map((f) => (
        <label key={f.key} className="block">
          <span className="mb-1 block text-sm font-semibold">
            {f.label}
            {!f.required && <span className="font-normal text-faint"> (optional)</span>}
            {original && (original[f.key] ?? '') !== (values[f.key] ?? '') && <span className="ml-2 text-xs font-semibold uppercase text-warn">changed</span>}
          </span>
          {f.type === 'textarea' ? (
            <textarea rows={3} className={input} value={values[f.key] ?? ''} onChange={(e) => onChange({ ...values, [f.key]: e.target.value })} />
          ) : (
            <input
              className={input}
              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              inputMode={f.type === 'number' ? 'numeric' : undefined}
              required={f.required}
              value={values[f.key] ?? ''}
              onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
            />
          )}
        </label>
      ))}
    </div>
  );
}

const show = (f: FieldDef, v: string | number | undefined) => (v === undefined || v === '' ? '—' : f.type === 'date' ? fmtDay(String(v)) : String(v));

/** Read-only fields. With `previous`, changed fields show the old value struck through and the new one in bold. */
export function FieldList({ fields, form, previous }: { fields: FieldDef[]; form: Record<string, string | number>; previous?: Record<string, string | number> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      {fields
        .filter((f) => (form[f.key] !== undefined || previous?.[f.key] !== undefined) && f.key !== 'title')
        .map((f) => {
          const changed = previous && String(previous[f.key] ?? '') !== String(form[f.key] ?? '');
          return (
            <div key={f.key} className={`${f.type === 'textarea' ? 'col-span-2' : ''} ${changed ? '-m-1.5 rounded-lg bg-warn-bg p-1.5' : ''}`}>
              <dt className="text-xs text-faint">
                {f.label}
                {changed && <span className="ml-1 font-semibold uppercase text-warn">changed</span>}
              </dt>
              {changed && <dd className="text-sm text-muted line-through">{show(f, previous![f.key])}</dd>}
              <dd className={changed ? 'font-bold' : 'font-medium'}>{show(f, form[f.key])}</dd>
            </div>
          );
        })}
    </dl>
  );
}
