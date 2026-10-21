import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useLive } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Icon } from './Icon';
import { Sheet, toast } from './ui';

type Kind = 'drawn' | 'typed' | 'uploaded';
type Saved = { dataUrl: string | null; kind?: Kind; updatedAt?: string };

const INK = '#16265c';
const STYLES = [
  { family: 'Mr Dafoe', css: 'Mr+Dafoe', size: 64 },
  { family: 'Herr Von Muellerhoff', css: 'Herr+Von+Muellerhoff', size: 72 },
  { family: 'Monsieur La Doulaise', css: 'Monsieur+La+Doulaise', size: 58 },
];

/** Crop a canvas to its ink (non-transparent pixels) with a small margin; returns a PNG data URL. */
function trimmed(c: HTMLCanvasElement): string | null {
  const ctx = c.getContext('2d')!;
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const m = 6;
  const out = document.createElement('canvas');
  out.width = Math.min(x1 - x0 + 1 + m * 2, 2400);
  out.height = Math.min(y1 - y0 + 1 + m * 2, 1200);
  out.getContext('2d')!.drawImage(c, x0 - m, y0 - m, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/** Draw with a pointer: smooth curves, a little thinner when the pen moves fast, like ink. */
function DrawPad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number; t: number; w: number } | null>(null);
  useEffect(() => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    c.width = r.width * 2;
    c.height = r.height * 2;
  }, []);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * 2, y: (e.clientY - r.top) * 2, t: e.timeStamp };
  };
  return (
    <div>
      <canvas
        ref={ref}
        className="h-44 w-full touch-none rounded-xl border border-rule bg-white"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          last.current = { ...pos(e), w: 5 };
        }}
        onPointerMove={(e) => {
          if (!last.current) return;
          const p = pos(e);
          const l = last.current;
          const v = Math.hypot(p.x - l.x, p.y - l.y) / Math.max(1, p.t - l.t);
          const w = Math.max(2.2, Math.min(6, l.w * 0.7 + (6.5 - v * 2.2) * 0.3));
          const ctx = ref.current!.getContext('2d')!;
          ctx.strokeStyle = INK;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(l.x, l.y);
          ctx.quadraticCurveTo(l.x, l.y, (l.x + p.x) / 2, (l.y + p.y) / 2);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = { ...p, w };
        }}
        onPointerUp={() => {
          last.current = null;
          onChange(trimmed(ref.current!));
        }}
      />
      <div className="mt-2 flex items-center justify-between text-xs text-faint">
        <span>Sign with your finger, stylus or mouse</span>
        <button
          type="button"
          className="font-semibold text-muted hover:text-ink"
          onClick={() => {
            const c = ref.current!;
            c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
            onChange(null);
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/** Your name in a handwriting style. */
function TypePad({ onChange }: { onChange: (png: string | null) => void }) {
  const { me } = useSession();
  const [name, setName] = useState(me?.name.replace(/^(Prof\.|Dr\.|Mr\.|Ms\.|Mrs\.)\s*/gi, '') ?? '');
  const [style, setStyle] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = 'signature-fonts';
    if (!document.getElementById(id)) {
      const link = Object.assign(document.createElement('link'), {
        id,
        rel: 'stylesheet',
        href: `https://fonts.googleapis.com/css2?${STYLES.map((s) => `family=${s.css}`).join('&')}&display=swap`,
      });
      document.head.appendChild(link);
    }
    Promise.all(STYLES.map((s) => document.fonts.load(`${s.size}px "${s.family}"`))).then(() => setReady(true), () => setReady(true));
  }, []);
  useEffect(() => {
    if (!ready || !name.trim()) return onChange(null);
    const s = STYLES[style];
    const c = document.createElement('canvas');
    c.width = 1400;
    c.height = 360;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = INK;
    ctx.font = `${s.size * 2}px "${s.family}"`;
    ctx.textBaseline = 'middle';
    ctx.translate(40, 180);
    ctx.rotate(-0.05);
    ctx.fillText(name.trim(), 0, 0);
    onChange(trimmed(c));
  }, [ready, name, style]);
  return (
    <div className="flex flex-col gap-3">
      <input className="w-full rounded-xl border border-rule px-4 py-3 outline-none focus:border-accent" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name as you sign it" />
      <div className="grid gap-2">
        {STYLES.map((s, i) => (
          <button
            key={s.family}
            type="button"
            onClick={() => setStyle(i)}
            className={`flex h-16 items-center overflow-hidden rounded-xl border bg-white px-4 text-left text-3xl ${style === i ? 'border-accent ring-2 ring-accent/20' : 'border-rule'}`}
            style={{ fontFamily: `"${s.family}", cursive`, color: INK }}
          >
            {name || 'Your name'}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A photo or scan of your signature on white paper: the paper is made transparent and the ink kept. */
function UploadPad({ onChange }: { onChange: (png: string | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  async function pick(file: File) {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    const scale = Math.min(1, 1600 / img.width);
    const c = document.createElement('canvas');
    c.width = img.width * scale;
    c.height = img.height * scale;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const px = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < px.data.length; i += 4) {
      const lum = 0.3 * px.data[i] + 0.59 * px.data[i + 1] + 0.11 * px.data[i + 2];
      // light paper fades to transparent; ink keeps its colour
      px.data[i + 3] = lum > 200 ? 0 : lum > 150 ? Math.round(((200 - lum) / 50) * 255) : 255;
    }
    ctx.putImageData(px, 0, 0);
    const png = trimmed(c);
    setPreview(png);
    onChange(png);
  }
  return (
    <label className="grid cursor-pointer place-items-center rounded-xl border-2 border-dashed border-rule bg-white px-4 py-6 text-center hover:border-accent/60">
      {preview ? <img src={preview} alt="Your signature" className="max-h-28" /> : <Icon name="upload" className="mb-1 h-6 w-6 text-accent" />}
      <span className="mt-1 text-sm font-semibold text-accent">{preview ? 'Choose another photo' : 'Upload a photo of your signature'}</span>
      <span className="text-xs text-faint">Sign on white paper, photograph it; the background is removed</span>
      <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
    </label>
  );
}

/** Create or replace the signature that goes on documents you sign. */
export function SignatureSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (s: Saved) => void }) {
  const [tab, setTab] = useState<Kind>('drawn');
  const [png, setPng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPng(null), [tab, open]);
  async function save() {
    if (!png) return;
    setBusy(true);
    try {
      const s = await api<Saved>('/api/me/signature', { method: 'PUT', json: { dataUrl: png, kind: tab } });
      toast('Signature saved. It goes on every document you sign from now on.');
      onSaved(s);
      onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const TABS: { k: Kind; label: string }[] = [
    { k: 'drawn', label: 'Draw' },
    { k: 'typed', label: 'Type' },
    { k: 'uploaded', label: 'Upload' },
  ];
  return (
    <Sheet open={open} onClose={() => !busy && onClose()}>
      <h2 className="text-lg font-bold">Your signature</h2>
      <p className="mb-4 mt-1 text-sm text-muted">Placed exactly where documents ask for it, with your name and the time under it.</p>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-panel p-1">
        {TABS.map((t) => (
          <button key={t.k} type="button" onClick={() => setTab(t.k)} className={`min-h-[40px] rounded-lg text-sm font-semibold ${tab === t.k ? 'bg-bg shadow-sm' : 'text-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {open && tab === 'drawn' && <DrawPad onChange={setPng} />}
      {open && tab === 'typed' && <TypePad onChange={setPng} />}
      {open && tab === 'uploaded' && <UploadPad onChange={setPng} />}
      <button className="cta mt-5 w-full py-4 text-base" disabled={!png || busy} onClick={save}>
        {busy ? 'Saving…' : 'Save signature'}
      </button>
    </Sheet>
  );
}

/** My signature: what is on file, and a way to add or change it. */
export function MySignature({ compact = false }: { compact?: boolean }) {
  const { data, reload } = useLive<Saved>('/api/me/signature', 120_000);
  const [open, setOpen] = useState(false);
  return (
    <section className={compact ? 'py-5' : ''}>
      <div className="mb-3 flex min-h-[28px] items-center justify-between gap-3">
        <h2 className="text-base font-semibold">My signature</h2>
        {data?.dataUrl && (
          <button className="link text-sm font-semibold" onClick={() => setOpen(true)}>
            Change
          </button>
        )}
      </div>
      {data?.dataUrl ? (
        <div className="rounded-xl border border-rule bg-white p-3">
          <img src={data.dataUrl} alt="Your signature" className="mx-auto max-h-16 object-contain" />
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">Save your signature once; it is placed in the right spot on every document you sign.</p>
          <button className="link mt-1 inline-flex min-h-[44px] items-center gap-1.5 font-semibold" onClick={() => setOpen(true)}>
            <Icon name="pen" className="h-4 w-4" /> Add my signature
          </button>
        </>
      )}
      <SignatureSheet open={open} onClose={() => setOpen(false)} onSaved={() => reload()} />
    </section>
  );
}
