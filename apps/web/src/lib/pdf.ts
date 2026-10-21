import type { PDFDocumentProxy } from 'pdfjs-dist';
import { auth, ApiError } from './api';

/** pdf.js, loaded only on screens that show a PDF (it is large). */
async function pdfjs() {
  const lib = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

/** Fetch an authenticated file (an attachment) as bytes. */
export async function fetchBytes(path: string): Promise<ArrayBuffer> {
  const res = await fetch(path, { headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {} });
  if (!res.ok) throw new ApiError('Could not load the document', res.status);
  return res.arrayBuffer();
}

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  // pdf.js takes ownership of the buffer; give it a copy so the caller can reuse theirs.
  return lib.getDocument({ data: data.slice(0) }).promise;
}

/** A place on the form where someone signs: page (1-based) and a box as fractions of the page, top-left origin. */
export interface FoundSpot {
  label: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Words a form uses for each kind of signer. */
const SYNONYMS: Record<string, string[]> = {
  guide: ['signature of guide', 'signature of the guide', 'project guide', 'guide'],
  'project coordinator': ['project coordinator', 'signature of project coordinator'],
  'head of department': ['head of department', 'signature of hod', 'hod', 'h.o.d.'],
  'class teacher': ['class teacher', 'signature of class teacher'],
  'dean student affairs': ['dean student affairs', 'dean'],
  't&p coordinator': ['t&p coordinator', 'training and placement officer', 'tpo'],
  'faculty in-charge': ['faculty in-charge', 'faculty incharge', 'faculty in charge'],
  mentor: ['mentor', 'signature of mentor'],
  principal: ['principal', 'director'],
};
const phrasesFor = (label: string) => {
  const key = label.trim().toLowerCase();
  return [...new Set([...(SYNONYMS[key] ?? []), key])].sort((a, b) => b.length - a.length);
};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Find sign spots: read the form's text and, for each signer label, find where the form asks for that signature.
 * A label followed by ":" ("Signature of Guide:") gets a box to its right; a caption under a line ("Guide") gets a
 * box above it. Lines naming a person ("Name of Internal Guide") are skipped.
 */
export async function findSpots(pdf: PDFDocumentProxy, labels: string[]): Promise<FoundSpot[]> {
  const found: FoundSpot[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const [x0, y0, x1, y1] = page.view;
    const W = x1 - x0;
    const H = y1 - y0;
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const str = item.str;
      const lower = str.toLowerCase();
      if (/name of|email|contact|\bdate\b/.test(lower) && !/signature/.test(lower)) continue;
      const [, , c, d, e, f] = item.transform as number[];
      const fs = Math.hypot(c, d) || 10;
      const perChar = (item.width || fs * str.length * 0.5) / Math.max(1, str.length);
      for (const label of labels) {
        for (const phrase of phrasesFor(label)) {
          const m = new RegExp(`(^|[^a-z])(${escape(phrase)})([^a-z]|$)`, 'i').exec(lower);
          if (!m) continue;
          const start = m.index + m[1].length;
          const px = e - x0 + perChar * start;
          const pw = perChar * phrase.length;
          const colon = /^\s*:/.test(str.slice(start + phrase.length));
          const bw = Math.max(120, pw + 24);
          const bh = 44;
          const base = f - y0; // baseline, from the bottom
          const box = colon
            ? { x: px + pw + perChar * 2, top: H - (base + fs * 0.35 + bh / 2), w: bw, h: bh }
            : { x: px + pw / 2 - bw / 2, top: H - (base + fs + 2 + bh), w: bw, h: bh };
          const x = Math.min(Math.max(box.x / W, 0), 1 - box.w / W);
          const y = Math.min(Math.max(box.top / H, 0), 1 - box.h / H);
          found.push({ label, page: n, x, y, w: box.w / W, h: box.h / H });
          break;
        }
      }
    }
  }
  return found;
}
