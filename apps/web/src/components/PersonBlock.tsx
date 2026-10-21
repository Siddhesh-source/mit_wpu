import type { ReactNode } from 'react';
import type { Person } from '@plc/shared';

/** A person as a block: avatar, name, designation, department, and the actions passed in. */
export function PersonBlock({ p, children, muted = false }: { p: Person; children?: ReactNode; muted?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 ${muted ? 'border-dashed border-rule bg-bg' : 'border-rule bg-panel'}`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold text-white ${p.kind === 'student' ? 'bg-ok' : 'bg-accent'}`}>{p.initials}</span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{p.name}</p>
          <p className="truncate text-xs text-muted">
            {p.roleLabel}
            {p.title && !p.title.startsWith(p.roleLabel) ? ` · ${p.title}` : ''}
          </p>
          <p className="truncate text-[11px] text-faint">{p.department}</p>
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
