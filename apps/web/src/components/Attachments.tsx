import { useRef, useState } from 'react';
import type { AttachmentInfo } from '@plc/shared';
import { download, uploadFile } from '../lib/api';
import { toast } from './ui';
import { Icon } from './Icon';

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Pick files (PDF, PNG, JPG); each uploads straight away and its id is added to `value`. */
export function AttachmentPicker({ value, onChange, max = 5 }: { value: AttachmentInfo[]; onChange: (v: AttachmentInfo[]) => void; max?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const next = [...value];
    for (const f of [...files].slice(0, max - value.length)) {
      try {
        next.push(await uploadFile<AttachmentInfo>(f));
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`);
      }
    }
    onChange(next);
    setBusy(false);
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-semibold">
        Attachments <span className="font-normal text-faint">(optional · PDF, PNG or JPG · up to {max})</span>
      </span>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1.5">
          {value.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-panel px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon name="file" className="h-4 w-4 text-faint" />
                <span className="truncate">{a.name}</span>
                <span className="shrink-0 text-faint">· {kb(a.size)}</span>
              </span>
              <button type="button" className="text-xs font-semibold text-bad" onClick={() => onChange(value.filter((x) => x.id !== a.id))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length < max && (
        <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="w-full rounded-xl border-2 border-dashed border-rule px-4 py-3 text-sm font-semibold text-accent disabled:opacity-50">
          {busy ? 'Uploading…' : <span className="inline-flex items-center gap-1.5"><Icon name="upload" className="h-4 w-4" /> Add a file</span>}
        </button>
      )}
      <input ref={ref} type="file" hidden multiple accept="application/pdf,image/png,image/jpeg" onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
    </div>
  );
}

/** Read-only list with authenticated downloads and each file's fingerprint. */
export function AttachmentList({ items }: { items: AttachmentInfo[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-rule px-3 py-2 text-sm">
          <button className="link flex min-w-0 items-center gap-1.5 text-left text-sm" onClick={() => download(`/api/attachments/${a.id}`, a.name).catch((e) => toast(e.message))}>
            <Icon name="file" className="h-4 w-4 text-faint" />
            <span className="truncate">{a.name}</span>
          </button>
          <span className="shrink-0 font-mono text-[11px] text-faint" title={`SHA-256 ${a.sha256}`}>
            {kb(a.size)} · {a.sha256.slice(0, 8)}
            {a.version > 1 && ` · v${a.version}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
