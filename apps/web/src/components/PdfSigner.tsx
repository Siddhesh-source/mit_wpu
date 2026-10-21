import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { SignField } from '@plc/shared';
import { Icon } from './Icon';

/** One colour per signer, in signing order (independent of the status colours). */
export const SIGNER_COLORS = ['#1D4F91', '#0F766E', '#9A3412', '#6D28D9', '#0369A1', '#A21CAF'];

export interface SignerChip {
  label: string;
  name?: string;
}

type Mode = 'edit' | 'view';
const DEFAULT = { w: 0.22, h: 0.055 };
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** One rendered page with its boxes on top. Boxes are fractions of the page, so they scale with the page. */
function PageView(props: {
  pdf: PDFDocumentProxy;
  n: number;
  width: number;
  /** This page's boxes, with their index in `all`. */
  fields: { f: SignField; i: number }[];
  signers: SignerChip[];
  mode: Mode;
  active: number | null;
  highlight?: number | null;
  images?: Record<number, string>;
  onChange?: (fields: SignField[]) => void;
  all: SignField[];
  editable?: (i: number) => boolean;
  signStep?: number | null;
  onSign?: () => void;
}) {
  const { pdf, n, width, fields, signers, mode, active, highlight, images, onChange, all, editable = () => true, signStep, onSign } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.414);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let live = true;
    pdf.getPage(n).then((page) => {
      if (!live || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: (width / base.width) * dpr });
      const c = canvas.current;
      c.width = vp.width;
      c.height = vp.height;
      task = page.render({ canvasContext: c.getContext('2d')!, viewport: vp });
      task.promise.catch(() => undefined);
    });
    return () => {
      live = false;
      task?.cancel();
    };
  }, [pdf, n, width]);

  // Drag (move) and resize with pointer events; the change is committed on release.
  const drag = useRef<{ i: number; kind: 'move' | 'size'; sx: number; sy: number; f: SignField } | null>(null);
  const [live, setLive] = useState<{ i: number; f: SignField } | null>(null);
  const start = (e: ReactPointerEvent, i: number, kind: 'move' | 'size') => {
    if (mode !== 'edit' || !editable(i)) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { i, kind, sx: e.clientX, sy: e.clientY, f: all[i] };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !host.current) return;
    const r = host.current.getBoundingClientRect();
    const dx = (e.clientX - d.sx) / r.width;
    const dy = (e.clientY - d.sy) / r.height;
    const f =
      d.kind === 'move'
        ? { ...d.f, x: clamp(d.f.x + dx, 0, 1 - d.f.w), y: clamp(d.f.y + dy, 0, 1 - d.f.h) }
        : { ...d.f, w: clamp(d.f.w + dx, 0.06, 1 - d.f.x), h: clamp(d.f.h + dy, 0.025, 1 - d.f.y) };
    setLive({ i: d.i, f });
  };
  const end = () => {
    if (drag.current && live) onChange?.(all.map((f, i) => (i === live.i ? live.f : f)));
    drag.current = null;
    setLive(null);
  };

  function place(e: React.MouseEvent) {
    if (mode !== 'edit' || active === null || !host.current) return;
    const r = host.current.getBoundingClientRect();
    const cx = (e.clientX - r.left) / r.width;
    const cy = (e.clientY - r.top) / r.height;
    const f: SignField = { step: active, page: n, w: DEFAULT.w, h: DEFAULT.h, x: clamp(cx - DEFAULT.w / 2, 0, 1 - DEFAULT.w), y: clamp(cy - DEFAULT.h / 2, 0, 1 - DEFAULT.h) };
    onChange?.([...all, f]);
  }

  return (
    <div
      ref={host}
      className={`relative w-full overflow-hidden rounded-lg border border-rule bg-white shadow-sm ${mode === 'edit' && active !== null ? 'cursor-crosshair' : ''}`}
      style={{ aspectRatio: `1 / ${ratio}` }}
      onClick={place}
      onPointerMove={move}
      onPointerUp={end}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <span className="absolute bottom-1.5 right-2 rounded bg-black/50 px-1.5 text-[10px] font-semibold text-white">{n}</span>
      {fields.map(({ f, i }) => {
        const box = live?.i === i ? live.f : f;
        const color = SIGNER_COLORS[(box.step - 1) % SIGNER_COLORS.length];
        const dim = highlight != null && box.step !== highlight;
        const img = images?.[box.step];
        const canEdit = mode === 'edit' && editable(i);
        // the signer's own unsigned box: one click signs
        const signHere = !img && !!onSign && signStep === box.step;
        return (
          <div
            key={i}
            onPointerDown={(e) => start(e, i, 'move')}
            onClick={(e) => (e.stopPropagation(), signHere && onSign!())}
            role={signHere ? 'button' : undefined}
            title={signHere ? 'Sign here' : undefined}
            className={`absolute flex touch-none select-none flex-col justify-end rounded-sm text-[10px] font-semibold leading-tight ${canEdit ? 'cursor-move' : ''} ${signHere ? 'cursor-pointer ring-2 ring-offset-1 hover:brightness-95' : ''} ${dim ? 'opacity-35' : ''}`}
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
              border: img ? '1px dashed transparent' : `1.5px solid ${color}`,
              background: img ? 'transparent' : `${color}1f`,
            }}
          >
            {img ? (
              <img src={img} alt={`Signature of ${signers[box.step - 1]?.name ?? signers[box.step - 1]?.label}`} className="h-full w-full object-contain object-bottom" />
            ) : (
              <span className="truncate px-1 pb-0.5" style={{ color }}>
                {signHere ? 'Sign here' : (signers[box.step - 1]?.label ?? 'Signer')}
              </span>
            )}
            {canEdit && (
              <>
                <button
                  type="button"
                  aria-label="Remove box"
                  className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-ink text-[11px] text-bg"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => (e.stopPropagation(), onChange?.(all.filter((_, j) => j !== i)))}
                >
                  ×
                </button>
                <span onPointerDown={(e) => start(e, i, 'size')} className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border-2 border-white" style={{ background: color }} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The document with signature boxes. Edit: pick a signer, tap the page to drop their box, drag to move, corner to
 * resize, × to remove. View: boxes (or the captured signatures) shown in place; `highlight` dims everyone else's.
 */
export function PdfSigner(props: {
  pdf: PDFDocumentProxy | null;
  fields: SignField[];
  signers: SignerChip[];
  mode: Mode;
  active?: number | null;
  highlight?: number | null;
  images?: Record<number, string>;
  onChange?: (fields: SignField[]) => void;
  /** Which boxes can be moved and removed in edit mode (default: all). */
  editable?: (i: number) => boolean;
  /** One-click signing: the signer's step, and what a click on their unsigned box does. */
  signStep?: number | null;
  onSign?: () => void;
}) {
  const { pdf, fields, signers, mode, active = null, highlight, images, onChange, editable, signStep, onSign } = props;
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!host.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(host.current);
    return () => ro.disconnect();
  }, []);
  // Pages with boxes first in view mode would hide the form's order; keep the document order always.
  const pages = pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : [];
  return (
    <div ref={host} className="flex flex-col gap-4">
      {!pdf && (
        <div className="grid aspect-[1/1.414] w-full place-items-center rounded-lg bg-panel text-sm text-muted">
          <span className="flex items-center gap-2">
            <Icon name="file" className="h-5 w-5" /> Loading the document…
          </span>
        </div>
      )}
      {pdf &&
        pages.map((n) => (
          <PageView
            key={n}
            pdf={pdf}
            n={n}
            width={width}
            all={fields}
            fields={fields.map((f, i) => ({ f, i })).filter(({ f }) => f.page === n)}
            signers={signers}
            mode={mode}
            active={active}
            highlight={highlight}
            images={images}
            onChange={onChange}
            editable={editable}
            signStep={signStep}
            onSign={onSign}
          />
        ))}
    </div>
  );
}
