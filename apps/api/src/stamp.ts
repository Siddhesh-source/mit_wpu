import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

/** One signature placed on the document: page (1-based), box as fractions of the page (top-left origin). */
export interface Stamp {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  png: Buffer;
  /** Small text under the signature: who, then as what and when. */
  caption: [string, string];
}

const INK = rgb(0.11, 0.2, 0.42);
const GREY = rgb(0.42, 0.45, 0.5);

/** WinAnsi-safe text for the standard fonts. */
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

/**
 * The signed copy: the original document page for page, each signature drawn inside its box with a one-line caption
 * under it, a footer on every page (request, version, where to verify), then the certificate page(s) appended.
 */
export async function stampDocument(original: Uint8Array, stamps: Stamp[], footer: string, certificate: Uint8Array, issuedAt: Date): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original, { ignoreEncryption: true, updateMetadata: false });
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const s of stamps) {
    const page = pages[s.page - 1];
    if (!page) continue;
    const { width: W, height: H } = page.getSize();
    const bx = s.x * W;
    const bw = s.w * W;
    const bh = s.h * H;
    const by = H - (s.y + s.h) * H; // pdf origin is bottom-left
    // two caption lines, shrunk together to fit the box width (min 4 pt), inside the box's bottom edge
    const lines = s.caption.map(safe);
    let size = 6;
    while (size > 4 && Math.max(...lines.map((l) => reg.widthOfTextAtSize(l, size))) > bw) size -= 0.25;
    const captionH = bh > 26 ? size * 2 + 3 : 0;
    const img = await doc.embedPng(s.png);
    const room = { w: bw - 4, h: bh - captionH - 2 };
    const scale = Math.min(room.w / img.width, room.h / img.height);
    const iw = img.width * scale;
    const ih = img.height * scale;
    page.drawImage(img, { x: bx + (bw - iw) / 2, y: by + captionH + (room.h - ih) / 2 + 1, width: iw, height: ih });
    if (captionH)
      lines.forEach((l, i) => {
        let shown = l;
        while (shown.length > 4 && reg.widthOfTextAtSize(shown, size) > bw) shown = `${shown.slice(0, -2)}.`;
        page.drawText(shown, { x: bx + Math.max(0, (bw - reg.widthOfTextAtSize(shown, size)) / 2), y: by + 1.5 + (1 - i) * (size + 1), size, font: reg, color: INK });
      });
  }

  // Footer on every original page, inside the bottom margin.
  const foot = safe(footer);
  for (const page of pages) {
    const { width: W } = page.getSize();
    const rot = page.getRotation().angle;
    const size = 6;
    const tw = reg.widthOfTextAtSize(foot, size);
    if (rot === 0) page.drawText(foot, { x: (W - tw) / 2, y: 9, size, font: reg, color: GREY });
    else page.drawText(foot, { x: 9, y: 9, size, font: reg, color: GREY, rotate: degrees(0) });
  }

  const cert = await PDFDocument.load(certificate);
  for (const p of await doc.copyPages(cert, cert.getPageIndices())) doc.addPage(p);
  doc.setProducer('CampusSign');
  doc.setModificationDate(issuedAt);
  return doc.save();
}
