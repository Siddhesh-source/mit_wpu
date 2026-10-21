import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { FormTemplate } from '@plc/shared';
import { HttpError } from './errors.js';

/**
 * VIT Pune form formats, generated as PDFs. Because we draw them, we know exactly where each signature goes: every
 * template returns its sign spots (label + box as fractions of the page, top-left origin) with the document.
 */

export interface Spot {
  label: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Person {
  name: string;
  department: string;
  email: string | null;
  phone: string | null;
  rollNo: string | null;
  year: string | null;
}

type Values = Record<string, string>;
const A4 = { w: 595.28, h: 841.89 };
const INK = rgb(0.06, 0.08, 0.1);
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

/** Small drawing kit for form pages (y measured from the top, like the page you read). */
class Sheet {
  page: PDFPage;
  constructor(
    private doc: PDFDocument,
    private reg: PDFFont,
    private bold: PDFFont,
    public pageNo: number,
  ) {
    this.page = doc.addPage([A4.w, A4.h]);
  }
  text(s: string, x: number, top: number, size = 10, font: 'reg' | 'bold' = 'reg') {
    this.page.drawText(safe(s), { x, y: A4.h - top - size, size, font: font === 'bold' ? this.bold : this.reg, color: INK });
  }
  /** Wrapped text inside a width; returns the height used. */
  para(s: string, x: number, top: number, width: number, size = 10, font: 'reg' | 'bold' = 'reg', lead = 1.35) {
    const f = font === 'bold' ? this.bold : this.reg;
    const lines: string[] = [];
    for (const raw of safe(s).split('\n')) {
      let line = '';
      for (const w of raw.split(/\s+/)) {
        const next = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(next, size) > width && line) (lines.push(line), (line = w));
        else line = next;
      }
      lines.push(line);
    }
    lines.forEach((l, i) => this.text(l, x, top + i * size * lead, size, font));
    return lines.length * size * lead;
  }
  box(x: number, top: number, w: number, h: number, width = 0.8) {
    this.page.drawRectangle({ x, y: A4.h - top - h, width: w, height: h, borderColor: INK, borderWidth: width });
  }
  line(x1: number, top1: number, x2: number, top2: number, width = 0.8) {
    this.page.drawLine({ start: { x: x1, y: A4.h - top1 }, end: { x: x2, y: A4.h - top2 }, thickness: width, color: INK });
  }
  /** Institute header used on every VIT form. */
  header(title: string, format: string) {
    this.text('Vishwakarma Institute of Technology, Pune', 56, 40, 14, 'bold');
    this.line(56, 57, 340, 57, 1);
    const issue = 'Issue 01 : Rev No. 00 : Dt. 01/08/22';
    this.text(issue, A4.w - 56 - this.bold.widthOfTextAtSize(issue, 9), 44, 9, 'bold');
    if (title) this.text(`Title : ${title}`, 70, 74, 10.5, 'bold');
    if (format) this.text(format, A4.w - 56 - this.bold.widthOfTextAtSize(format, 10.5), 74, 10.5, 'bold');
  }
  /** A label under a signature line; the spot is the space above the line. */
  signLine(label: string, cx: number, top: number, spots: Spot[], w = 130, h = 44) {
    const lw = this.bold.widthOfTextAtSize(label, 10);
    this.line(cx - w / 2, top - 4, cx + w / 2, top - 4, 0.5);
    this.text(label, cx - lw / 2, top, 10, 'bold');
    spots.push(spotOf(label, this.pageNo, cx - w / 2, top - 4 - h, w, h));
  }
}

const spotOf = (label: string, page: number, x: number, top: number, w: number, h: number): Spot => ({
  label,
  page,
  x: x / A4.w,
  y: top / A4.h,
  w: w / A4.w,
  h: h / A4.h,
});

const v = (vals: Values, k: string, fallback = '') => (vals[k] ?? '').trim() || fallback;
const today = () => new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });

// ---------- FF No. 180: Project Registration & Progress Review ----------

function ff180(doc: PDFDocument, reg: PDFFont, bold: PDFFont, vals: Values, me: Person): Spot[] {
  const spots: Spot[] = [];
  const s = new Sheet(doc, reg, bold, 1);
  s.header('Project Registration & Progress Review', 'FF No. 180');
  const L = 70;
  const R = A4.w - 60;
  const mid = 300;
  let top = 110;
  const row = (h: number, cells: [string, number, number][]) => {
    s.box(L, top, R - L, h);
    for (const [txt, x, w] of cells) s.para(txt, x + 12, top + (h - 10) / 2 - 2, w - 24, 10, 'bold');
    if (cells.length > 1) s.line(mid, top, mid, top + h);
    top += h;
  };
  row(36, [[`Department: ${v(vals, 'department', me.department)}`, L, mid - L], [`Academic Year: ${v(vals, 'academicYear', '2025-26')}`, mid, R - mid]]);
  row(30, [[`Semester : ${v(vals, 'semester', 'I')}`, L, mid - L], [`Group No. : ${v(vals, 'groupNo')}`, mid, R - mid]]);
  row(52, [[`Project Title: ${v(vals, 'projectTitle').toUpperCase()}`, L, R - L]]);
  row(48, [[`Project Area: ${v(vals, 'projectArea').toUpperCase()}`, L, R - L]]);

  top += 18;
  s.text('Group Members Details:', L + 6, top, 10, 'bold');
  top += 20;
  const cols: [string, number][] = [['Sr. No.', 30], ['Class & Div.', 66], ['Roll No.', 36], ['G.R.No.', 52], ['Name of Student', 110], ['Contact No.', 66], ['Email ID', 105]];
  const tw = cols.reduce((a, [, w]) => a + w, 0);
  const scale = (R - L) / tw;
  const xs: number[] = [];
  cols.reduce((x, [, w]) => (xs.push(x), x + w * scale), L);
  const members = v(vals, 'members')
    .split('\n')
    .map((l) => l.split(',').map((c) => c.trim()))
    .filter((c) => c.some(Boolean))
    .slice(0, 6);
  const rowsN = Math.max(members.length, 4);
  const rh = 22;
  s.box(L, top, R - L, rh * (rowsN + 1));
  xs.slice(1).forEach((x) => s.line(x, top, x, top + rh * (rowsN + 1)));
  for (let i = 1; i <= rowsN; i++) s.line(L, top + rh * i, R, top + rh * i);
  cols.forEach(([h], i) => s.para(h, xs[i] + 4, top + 4, cols[i][1] * scale - 8, 8.5, 'reg', 1.15));
  members.forEach((m, r) => {
    const cells = [String(r + 1), ...m];
    cells.slice(0, cols.length).forEach((c, i) => s.para(c, xs[i] + 4, top + rh * (r + 1) + 7, cols[i][1] * scale - 6, i === 6 ? 7.5 : 8.5));
  });
  top += rh * (rowsN + 1) + 22;

  s.box(L, top, R - L, 44);
  s.text(`Name of Internal Guide: ${v(vals, 'guideName')}`, L + 12, top + 10, 10);
  s.text(`Contact No. ${v(vals, 'guideContact')}    Email ID : ${v(vals, 'guideEmail')}`, L + 12, top + 26, 9.5);
  top += 44 + 24;

  const boxH = 150;
  s.box(L, top, R - L, boxH);
  s.text('Project approved / Not approved', L + 14, top + 18, 10);
  const lineTop = top + boxH - 26;
  const third = (R - L) / 3;
  s.signLine('Guide', L + third * 0.5, lineTop, spots);
  s.signLine('Project Coordinator', L + third * 1.5, lineTop, spots);
  s.signLine('Head of Department', L + third * 2.5, lineTop, spots);

  // Page 2: progress review schedule (signed by the guide at each review)
  const p2 = new Sheet(doc, reg, bold, 2);
  p2.header('', 'FF No. 180');
  let t2 = 100;
  const c2 = [L, L + 90, L + 210, L + 330, R];
  const r2 = [36, 34, 34, 34];
  p2.box(L, t2, R - L, r2.reduce((a, b) => a + b, 0));
  let acc = t2;
  for (const h of r2.slice(0, -1)) (acc += h), p2.line(L, acc, R, acc);
  p2.line(c2[1], t2, c2[1], t2 + r2.reduce((a, b) => a + b, 0));
  for (const x of c2.slice(2, 4)) p2.line(x, t2 + r2[0], x, t2 + r2.reduce((a, b) => a + b, 0));
  p2.text('Group No.', L + 8, t2 + 13, 10);
  p2.text(v(vals, 'groupNo'), c2[1] + 10, t2 + 13, 10, 'bold');
  const heads = ['Activity', 'Review Schedule', 'Progress Review Report submitted', 'Signature of Guide'];
  heads.forEach((h, i) => p2.para(h, c2[i] + 8, t2 + r2[0] + 8, c2[i + 1] - c2[i] - 14, 9.5));
  [['Review 1', 'Mid Sem. Semester'], ['Review 2', 'End of Semester']].forEach(([a, b], i) => {
    const rt = t2 + r2[0] + r2[1] + r2[2] * i;
    p2.text(a, c2[0] + 12, rt + 12, 9.5);
    p2.text(b, c2[1] + 10, rt + 12, 9.5);
    p2.text('Yes  /  No', c2[2] + 34, rt + 12, 9.5);
  });
  t2 += r2.reduce((a, b) => a + b, 0) + 30;
  p2.text('Format of Progress Review Report:', L - 14, t2, 10);
  t2 += 22;
  p2.box(L, t2, R - L, 470);
  p2.text(`Review No.: 1          Group No.: ${v(vals, 'groupNo')}          Date:`, L + 10, t2 + 10, 10, 'bold');
  p2.line(L, t2 + 32, R, t2 + 32);
  p2.text('Signature of Guide:', L + 12, t2 + 470 - 22, 10, 'bold');
  return spots;
}

// ---------- Leave / On-duty application ----------

function leave(doc: PDFDocument, reg: PDFFont, bold: PDFFont, vals: Values, me: Person): Spot[] {
  const spots: Spot[] = [];
  const s = new Sheet(doc, reg, bold, 1);
  s.header('Application for Leave / On Duty', '');
  const L = 70;
  const W = A4.w - 140;
  let top = 112;
  s.text(`Date: ${today()}`, A4.w - 70 - reg.widthOfTextAtSize(`Date: ${today()}`, 10), top, 10);
  top += 26;
  s.para('To,\nThe Head of Department,\n' + me.department + ',\nVishwakarma Institute of Technology, Pune.', L, top, W, 10.5);
  top += 70;
  s.text(`Subject: Application for ${v(vals, 'kind', 'leave').toLowerCase()} from ${v(vals, 'from')} to ${v(vals, 'to')}`, L, top, 10.5, 'bold');
  top += 28;
  s.text('Respected Sir / Madam,', L, top, 10.5);
  top += 22;
  top += s.para(
    `I, ${me.name}${me.rollNo ? ` (Roll No. ${me.rollNo})` : ''}${me.year ? `, ${me.year}` : ''}, request you to grant me ${v(vals, 'kind', 'leave').toLowerCase()} from ${v(vals, 'from')} to ${v(vals, 'to')} for the following reason: ${v(vals, 'reason')}.`,
    L,
    top,
    W,
    10.5,
  );
  top += 10;
  top += s.para('I will complete the work missed during this period and submit any pending assignments on my return. Kindly grant the same.', L, top, W, 10.5);
  top += 24;
  s.text('Thanking you,', L, top, 10.5);
  s.text('Yours faithfully,', L, top + 16, 10.5);
  s.text(me.name, L, top + 50, 10.5, 'bold');
  if (me.email) s.text(me.email, L, top + 66, 9.5);
  top += 120;
  s.box(L, top, W, 120);
  s.text('For office use', L + 12, top + 12, 9.5, 'bold');
  s.signLine('Class Teacher', L + W * 0.25, top + 96, spots);
  s.signLine('Head of Department', L + W * 0.75, top + 96, spots);
  return spots;
}

// ---------- Internship No Objection Certificate ----------

function noc(doc: PDFDocument, reg: PDFFont, bold: PDFFont, vals: Values, me: Person): Spot[] {
  const spots: Spot[] = [];
  const s = new Sheet(doc, reg, bold, 1);
  s.header('No Objection Certificate (Internship)', '');
  const L = 70;
  const W = A4.w - 140;
  let top = 116;
  s.text(`Date: ${today()}`, A4.w - 70 - reg.widthOfTextAtSize(`Date: ${today()}`, 10), top, 10);
  top += 34;
  const title = 'TO WHOMSOEVER IT MAY CONCERN';
  s.text(title, (A4.w - bold.widthOfTextAtSize(title, 12)) / 2, top, 12, 'bold');
  top += 36;
  top += s.para(
    `This is to certify that ${me.name}${me.rollNo ? ` (Roll No. ${me.rollNo})` : ''}, a student of ${me.year ? `${me.year}, ` : ''}${me.department}, Vishwakarma Institute of Technology, Pune, has been permitted to undertake an internship at ${v(vals, 'company')}, ${v(vals, 'location')}, from ${v(vals, 'from')} to ${v(vals, 'to')}.`,
    L,
    top,
    W,
    11,
  );
  top += 12;
  top += s.para(
    `The institute has no objection to the student pursuing this internship${v(vals, 'role') ? ` as ${v(vals, 'role')}` : ''}, provided it does not affect the student's academic schedule and examinations.`,
    L,
    top,
    W,
    11,
  );
  top += 80;
  s.signLine('T&P Coordinator', L + W * 0.25, top, spots);
  s.signLine('Head of Department', L + W * 0.75, top, spots);
  return spots;
}

// ---------- Industrial visit consent ----------

function iv(doc: PDFDocument, reg: PDFFont, bold: PDFFont, vals: Values, me: Person): Spot[] {
  const spots: Spot[] = [];
  const s = new Sheet(doc, reg, bold, 1);
  s.header('Industrial Visit: Permission and Consent', '');
  const L = 70;
  const W = A4.w - 140;
  let top = 112;
  const rows: [string, string][] = [
    ['Department', me.department],
    ['Industry / organisation', v(vals, 'industry')],
    ['Place', v(vals, 'place')],
    ['Date of visit', v(vals, 'date')],
    ['Faculty in-charge', v(vals, 'faculty')],
    ['Number of students', v(vals, 'students')],
    ['Mode of travel', v(vals, 'travel', 'Institute bus')],
  ];
  for (const [k, val] of rows) {
    s.box(L, top, W, 26);
    s.line(L + 170, top, L + 170, top + 26);
    s.text(k, L + 10, top + 8, 10, 'bold');
    s.text(val, L + 180, top + 8, 10);
    top += 26;
  }
  top += 24;
  s.text('Purpose of the visit', L, top, 10.5, 'bold');
  top += 18;
  top += s.para(v(vals, 'purpose'), L, top, W, 10.5);
  top += 20;
  top += s.para(
    'The students will follow the safety rules of the organisation and the institute code of conduct during the visit. The faculty in-charge will accompany the students throughout.',
    L,
    top,
    W,
    10,
  );
  top += 90;
  s.signLine('Faculty In-charge', L + W / 6, top, spots, 120);
  s.signLine('Head of Department', L + W / 2, top, spots, 120);
  s.signLine('Dean Student Affairs', L + (W * 5) / 6, top, spots, 120);
  return spots;
}

const DRAW: Record<string, (doc: PDFDocument, reg: PDFFont, bold: PDFFont, vals: Values, me: Person) => Spot[]> = { ff180, leave, noc, iv };

export const TEMPLATES: FormTemplate[] = [
  {
    code: 'ff180',
    name: 'Project Registration & Progress Review',
    format: 'FF No. 180',
    description: 'Register your project group with your guide; signed by the Guide, Project Coordinator and Head of Department',
    signers: ['Guide', 'Project Coordinator', 'Head of Department'],
    inputs: [
      { key: 'academicYear', label: 'Academic year', type: 'text', required: true, placeholder: '2025-26' },
      { key: 'semester', label: 'Semester', type: 'text', required: true, placeholder: 'I' },
      { key: 'groupNo', label: 'Group number', type: 'text', required: true, placeholder: 'TY-AIDS-B-G15' },
      { key: 'projectTitle', label: 'Project title', type: 'text', required: true },
      { key: 'projectArea', label: 'Project area', type: 'text', required: true, placeholder: 'Agentic AI' },
      { key: 'members', label: 'Group members (one per line: class & div, roll no, G.R. no, name, contact, email)', type: 'textarea', required: true, placeholder: 'SY AIDS-B, 68, 12415169, Your Name, 9xxxxxxxxx, you@vit.edu' },
      { key: 'guideName', label: 'Internal guide', type: 'text', required: true, placeholder: 'Prof. Dr. Minal Barhate' },
      { key: 'guideContact', label: 'Guide contact no.', type: 'text', required: false },
      { key: 'guideEmail', label: 'Guide email', type: 'text', required: false },
    ],
  },
  {
    code: 'leave',
    name: 'Leave / On-duty application',
    format: 'Student application',
    description: 'Leave or on-duty for one or more days; recommended by the Class Teacher, approved by the HoD',
    signers: ['Class Teacher', 'Head of Department'],
    inputs: [
      { key: 'kind', label: 'Leave or on duty', type: 'text', required: true, placeholder: 'Leave' },
      { key: 'from', label: 'From', type: 'date', required: true },
      { key: 'to', label: 'To', type: 'date', required: true },
      { key: 'reason', label: 'Reason', type: 'textarea', required: true },
    ],
  },
  {
    code: 'noc',
    name: 'Internship No Objection Certificate',
    format: 'NOC',
    description: 'NOC for an internship; signed by the T&P Coordinator and the Head of Department',
    signers: ['T&P Coordinator', 'Head of Department'],
    inputs: [
      { key: 'company', label: 'Company', type: 'text', required: true },
      { key: 'location', label: 'Location', type: 'text', required: true, placeholder: 'Pune' },
      { key: 'role', label: 'Role', type: 'text', required: false, placeholder: 'Software Engineering Intern' },
      { key: 'from', label: 'From', type: 'date', required: true },
      { key: 'to', label: 'To', type: 'date', required: true },
    ],
  },
  {
    code: 'iv',
    name: 'Industrial visit consent',
    format: 'IV permission',
    description: 'Permission for an industrial visit; signed by the Faculty In-charge, HoD and Dean Student Affairs',
    signers: ['Faculty In-charge', 'Head of Department', 'Dean Student Affairs'],
    inputs: [
      { key: 'industry', label: 'Industry / organisation', type: 'text', required: true },
      { key: 'place', label: 'Place', type: 'text', required: true },
      { key: 'date', label: 'Date of visit', type: 'date', required: true },
      { key: 'faculty', label: 'Faculty in-charge', type: 'text', required: true },
      { key: 'students', label: 'Number of students', type: 'text', required: true },
      { key: 'travel', label: 'Mode of travel', type: 'text', required: false, placeholder: 'Institute bus' },
      { key: 'purpose', label: 'Purpose of the visit', type: 'textarea', required: true },
    ],
  },
];

/** Generate a template as a PDF, filled with the student's details and answers. Returns the bytes and its sign spots. */
export async function generateTemplate(code: string, input: unknown, me: Person): Promise<{ pdf: Buffer; spots: Spot[]; template: FormTemplate }> {
  const template = TEMPLATES.find((t) => t.code === code);
  if (!template) throw new HttpError(404, 'Unknown form');
  const vals: Values = {};
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  for (const f of template.inputs) {
    const raw = src[f.key];
    const val = typeof raw === 'string' ? raw.trim().slice(0, f.type === 'textarea' ? 1500 : 200) : '';
    if (f.required && !val) throw new HttpError(400, `${f.label} is required`);
    vals[f.key] = f.type === 'date' && val ? new Date(`${val}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : val;
  }
  const doc = await PDFDocument.create();
  doc.setTitle(`${template.name} - ${me.name}`);
  doc.setProducer('CampusSign');
  const reg = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const spots = DRAW[code](doc, reg, bold, vals, me);
  return { pdf: Buffer.from(await doc.save()), spots, template };
}
