import type { FieldDef } from '@plc/shared';
import { fmtDay } from '../lib/hooks';

export type FormValues = Record<string, string>;

const input = 'w-full rounded-xl border border-rule bg-bg px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

export function FormFields({ fields, values, onChange }: { fields: FieldDef[]; values: FormValues; onChange: (v: FormValues) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {fields.map((f) => (
        <label key={f.key} className="block">
          <span className="mb-1 block text-sm font-semibold">
            {f.label}
            {!f.required && <span className="font-normal text-faint"> (optional)</span>}
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

export function FieldList({ fields, form }: { fields: FieldDef[]; form: Record<string, string | number> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      {fields
        .filter((f) => form[f.key] !== undefined && f.key !== 'title')
        .map((f) => (
          <div key={f.key} className={f.type === 'textarea' ? 'col-span-2' : ''}>
            <dt className="text-xs text-faint">{f.label}</dt>
            <dd className="font-medium">{f.type === 'date' ? fmtDay(String(form[f.key])) : String(form[f.key])}</dd>
          </div>
        ))}
    </dl>
  );
}
