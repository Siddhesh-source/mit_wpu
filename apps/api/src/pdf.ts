import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import type { FieldDef } from '@plc/shared';

const hex = (h: string) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
const C = { ink: hex('101418'), muted: hex('5A6370'), faint: hex('6B7480'), rule: hex('E1E4E8'), panel: hex('F4F6F8'), accent: hex('1D4F91'), ok: hex('1E7A4C') };

export interface PdfInput {
  requestId: string;
  version: number;
  prevHash: string | null;
  reason: string | null;
  typeName: string;
  title: string;
  student: { name: string; title: string; department: string };
  fields: FieldDef[];
  form: Record<string, string | number>;
  signers: { roleLabel: string; name: string; signedAt: string; version: number; carried: boolean; fingerprint: string; onBehalfOf?: string | null }[];
  attachments: { name: string; sha256: string; size: number }[];
  collegeId: string;
  validity: string;
  /** Sign in place: this page is the certificate appended to the student's own signed document. */
  signedCopy?: { pages: number } | null;
  qrUrl: string;
  issuedAt: Date;
}

/** Keep text inside the WinAnsi set the standard fonts can draw. */
const safe = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E -ÿ]/g, '?');

const ist = (iso: string | Date) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export const istDay = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(text).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Sealed approval letter, A4, in the deck's "Public Record" style. */
export async function buildApprovalPdf(p: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${p.typeName} ${p.requestId} v${p.version}`);
  doc.setAuthor('CampusSign');
  doc.setProducer('CampusSign');
  doc.setCreator('CampusSign');
  doc.setCreationDate(p.issuedAt);
  doc.setModificationDate(p.issuedAt);

  const page: PDFPage = doc.addPage([595.28, 841.89]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const L = 56;
  const R = 595.28 - 56;
  const W = R - L;
  let y = 841.89 - 64;
  const text = (s: string, x: number, yy: number, font: PDFFont, size: number, color = C.ink) => page.drawText(safe(s), { x, y: yy, font, size, color });

  // Header
  page.drawRectangle({ x: 0, y: 841.89 - 8, width: 595.28, height: 8, color: C.accent });
  text('CampusSign', L, y, bold, 16, C.accent);
  const tag = 'SIGNED APPROVAL';
  text(tag, R - mono.widthOfTextAtSize(tag, 9), y + 3, mono, 9, C.muted);
  y -= 34;

  text(`${p.typeName.toUpperCase()}  |  ${p.requestId}  |  v${p.version}  |  ${p.collegeId}`, L, y, mono, 9.5, C.muted);
  y -= 26;
  for (const line of wrap(p.title, bold, 24, W)) {
    text(line, L, y, bold, 24);
    y -= 28;
  }
  text(`${p.student.name}  -  ${p.student.title}  -  ${p.student.department}`, L, y, reg, 11, C.muted);
  y -= 18;
  if (p.version > 1 && p.prevHash) {
    text(`Amends v${p.version - 1} (${p.prevHash.slice(0, 16)}...)${p.reason ? ` - ${p.reason}` : ''}`, L, y, reg, 10, C.accent);
    y -= 16;
  }
  y -= 10;

  // Fields panel
  const shown = p.fields.filter((f) => f.key !== 'title' && p.form[f.key] !== undefined);
  const rows: [string, string][] = shown.map((f) => [f.label, f.type === 'date' ? istDay(String(p.form[f.key])) : String(p.form[f.key])]);
  if (p.signedCopy) rows.push(['Signed copy', `Signatures placed on the original document (${p.signedCopy.pages} page${p.signedCopy.pages > 1 ? 's' : ''}) before this certificate`]);
  else rows.push(['Valid', p.validity]);
  const rowH = rows.map(([, v]) => 18 + 14 * wrap(v, reg, 11.5, W - 170).length);
  const panelH = rowH.reduce((a, b) => a + b, 0) + 16;
  page.drawRectangle({ x: L, y: y - panelH, width: W, height: panelH, color: C.panel });
  let ry = y - 22;
  rows.forEach(([k, v], i) => {
    text(k, L + 16, ry, reg, 10, C.faint);
    wrap(v, reg, 11.5, W - 170).forEach((line, j) => text(line, L + 150, ry - 14 * j, k === 'Valid' ? bold : reg, 11.5));
    ry -= rowH[i];
  });
  y -= panelH + 22;

  // Attachments (their SHA-256 is part of what every approver signed)
  if (p.attachments.length) {
    text('Attachments', L, y, bold, 11);
    y -= 15;
    for (const a of p.attachments) {
      text(`${a.name} (${Math.max(1, Math.round(a.size / 1024))} KB)`, L + 12, y, reg, 9.5, C.ink);
      const h = `sha256 ${a.sha256.slice(0, 24)}...`;
      text(h, R - mono.widthOfTextAtSize(h, 8), y, mono, 8, C.faint);
      y -= 13;
    }
    y -= 12;
  }

  // Signatures
  text('Approvals', L, y, bold, 13);
  y -= 8;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: C.rule });
  y -= 18;
  for (const s of p.signers) {
    page.drawCircle({ x: L + 6, y: y + 4, size: 5, color: C.ok });
    text(s.roleLabel, L + 20, y, bold, 11);
    text(s.onBehalfOf ? `${s.name} (for ${s.onBehalfOf})` : s.name, L + 170, y, reg, 11);
    const note = !s.carried
      ? `approved v${s.version}`
      : s.version === p.version
        ? `approved v${s.version} before the student's changes (not affected)`
        : `approved v${s.version}, carried to v${p.version}`;
    text(`${note}  -  ${ist(s.signedAt)} IST`, L + 20, y - 14, reg, 9.5, C.muted);
    text(`sig ${s.fingerprint}`, R - mono.widthOfTextAtSize(`sig ${s.fingerprint}`, 8.5), y, mono, 8.5, C.faint);
    y -= 36;
  }

  // QR + footer
  const qr = await QRCode.toBuffer(p.qrUrl, { errorCorrectionLevel: 'M', margin: 1, width: 600, color: { dark: '#101418', light: '#FFFFFF' } });
  const img = await doc.embedPng(qr);
  const q = 132;
  page.drawImage(img, { x: R - q, y: 70, width: q, height: q });
  text('Scan to verify', R - q, 56, bold, 9, C.ink);
  text(p.signedCopy ? 'Or upload this PDF on Verify' : 'Works offline at the gate', R - q, 45, reg, 8.5, C.muted);

  const foot = [
    `Issued ${ist(p.issuedAt)} IST by CampusSign.`,
    'The SHA-256 fingerprint of this file is anchored on a blockchain.',
    'Any change to this file, even one character, fails verification.',
    'Hash only, no personal data on chain.',
  ];
  // No "Verified" stamp on the file itself: only a live scan can say that (an old version must read Superseded).
  foot.forEach((line, i) => text(line, L, 120 - i * 14, reg, 9, C.muted));

  return doc.save({ useObjectStreams: false });
}
