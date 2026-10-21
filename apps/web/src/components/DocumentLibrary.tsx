import { useRef, useState, type DragEvent } from 'react';
import type { LibraryDocument } from '@plc/shared';
import { api, uploadFile } from '../lib/api';
import { toast } from './ui';

const ACCEPT = ['application/pdf', 'image/png', 'image/jpeg'];
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * "My documents": drop files (or click) to add them to the library; tick documents to send them.
 * The library is reusable: sending a document attaches a copy and keeps this one.
 */
export function DocumentLibrary({
  docs,
  onChanged,
  selected,
  onSelect,
  compact = false,
}: {
  docs: LibraryDocument[] | null;
  onChanged: () => void;
  selected: string[];
  onSelect: (ids: string[]) => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(0);

  async function add(files: File[]) {
    const ok = files.filter((f) => ACCEPT.includes(f.type));
    if (ok.length < files.length) toast('Only PDF, PNG or JPG files');
    setBusy((n) => n + ok.length);
    const added: string[] = [];
    for (const f of ok) {
      try {
        added.push((await uploadFile<{ id: string }>(f)).id);
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (added.length) onSelect([...selected, ...added]);
    onChanged();
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    add([...e.dataTransfer.files]);
  }

  async function remove(id: string) {
    await api(`/api/documents/${id}`, { method: 'DELETE' }).catch((e) => toast(e.message));
    onSelect(selected.filter((x) => x !== id));
    onChanged();
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        onClick={() => ref.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && ref.current?.click()}
        className={`grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed px-4 text-center transition ${compact ? 'py-4' : 'py-7'} ${
          over ? 'border-accent bg-accent/5' : 'border-rule hover:border-accent/50'
        }`}
      >
        <p className="text-2xl">⬆</p>
        <p className="text-sm font-semibold text-accent">{busy ? `Uploading ${busy}…` : 'Drop files here'}</p>
        <p className="text-xs text-faint">or click to choose · PDF, PNG, JPG · 5 MB</p>
        <input ref={ref} type="file" hidden multiple accept={ACCEPT.join(',')} onChange={(e) => (add([...(e.target.files ?? [])]), (e.target.value = ''))} />
      </div>
      {docs && docs.length === 0 && <p className="text-xs text-faint">No documents yet.</p>}
      <ul className="flex flex-col gap-1.5">
        {docs?.map((d) => {
          const on = selected.includes(d.id);
          return (
            <li key={d.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${on ? 'border-accent bg-panel' : 'border-rule'}`}>
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-accent" checked={on} onChange={() => onSelect(on ? selected.filter((x) => x !== d.id) : [...selected, d.id])} aria-label={`Select ${d.name}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{d.mime === 'application/pdf' ? '📄' : '🖼️'} {d.name}</span>
                <span className="text-[11px] text-faint">
                  {kb(d.size)}
                  {d.usedIn > 0 && ` · sent ${d.usedIn}×`}
                </span>
              </span>
              <button className="shrink-0 px-1 text-faint hover:text-bad" title="Remove from my documents" onClick={() => remove(d.id)}>
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
