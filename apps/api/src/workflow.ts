import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { APPROVER_ROLES, ROLE_LABEL, sha256Hex, canonicalJson, signJson } from '@plc/shared';
import type { Decision, FieldDef, RequestComment, RequestDetail, RequestStatus, RequestSummary, Role, TimelineStep } from '@plc/shared';
import type { DB } from './db.js';
import { HttpError } from './errors.js';
import { issuerKey } from './keys.js';
import { link, notify } from './notify.js';

type Form = Record<string, string | number>;

interface RequestRow {
  id: string;
  student_id: string;
  recipient_id?: string | null;
  department_id: string;
  type: string;
  status: RequestStatus;
  current_version: number;
  round: number;
  created_at: string;
  updated_at: string;
}

interface ApprovalRow {
  id: number;
  request_id: string;
  version: number;
  round: number;
  step_no: number;
  role: Role;
  assignee_id: string;
  decision: Decision;
  comment: string | null;
  opened_at: string | null;
  signed_at: string | null;
}

const now = () => new Date().toISOString();

export function audit(db: DB, requestId: string | null, actorId: string | null, action: string, version: number | null, details: object = {}) {
  db.prepare('INSERT INTO audit_log (request_id, actor_id, action, version, details_json, at) VALUES (?, ?, ?, ?, ?, ?)').run(
    requestId, actorId, action, version, JSON.stringify(details), now(),
  );
}

export function getType(db: DB, code: string) {
  const t = db.prepare('SELECT code, name, fields_json FROM request_types WHERE code = ?').get(code) as
    | { code: string; name: string; fields_json: string }
    | undefined;
  if (!t) throw new HttpError(400, 'Unknown request type');
  const steps = db.prepare('SELECT step_no, role, affected_by_json FROM route_steps WHERE request_type = ? ORDER BY step_no, rowid').all(code) as {
    step_no: number;
    role: Role;
    affected_by_json: string;
  }[];
  return {
    code: t.code,
    name: t.name,
    fields: JSON.parse(t.fields_json) as FieldDef[],
    steps: steps.map((s) => ({ stepNo: s.step_no, role: s.role, affectedBy: JSON.parse(s.affected_by_json) as string[] })),
  };
}

/** The signer chain of a request: the catalogue chain of its type, or the one the student chose for a custom request. */
export function stepsOf(db: DB, req: { id: string; type: string }) {
  const own = db.prepare('SELECT step_no, role, affected_by_json FROM request_routes WHERE request_id = ? ORDER BY step_no').all(req.id) as {
    step_no: number;
    role: Role;
    affected_by_json: string;
  }[];
  if (!own.length) return getType(db, req.type).steps;
  return own.map((s) => ({ stepNo: s.step_no, role: s.role, affectedBy: JSON.parse(s.affected_by_json) as string[] }));
}

/** Designations a student may pick as signers on a custom request, in order (1–6, no repeats). */
const MAX_CUSTOM_STEPS = 6;
function customChain(fields: FieldDef[], chain: unknown) {
  if (!Array.isArray(chain) || !chain.length) throw new HttpError(400, 'Choose at least one person to sign');
  if (chain.length > MAX_CUSTOM_STEPS) throw new HttpError(400, `At most ${MAX_CUSTOM_STEPS} signers`);
  if (chain.some((r) => typeof r !== 'string' || !APPROVER_ROLES.includes(r as Role))) throw new HttpError(400, 'Unknown designation');
  if (new Set(chain).size !== chain.length) throw new HttpError(400, 'Each designation can sign once');
  // Any change to the request goes back to every signer.
  const all = [...fields.map((f) => f.key), 'attachments'];
  return (chain as Role[]).map((role, i) => ({ stepNo: i + 1, role, affectedBy: all }));
}

export function listTypes(db: DB) {
  const codes = db.prepare('SELECT code FROM request_types ORDER BY rowid').pluck().all() as string[];
  return codes.map((c) => {
    const t = getType(db, c);
    return { code: t.code, name: t.name, fields: t.fields, chain: t.steps };
  });
}

/** Keep only known fields, trim strings, enforce required ones, coerce numbers. */
export function cleanForm(fields: FieldDef[], input: unknown): Form {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Form is missing');
  const raw = input as Record<string, unknown>;
  const form: Form = {};
  for (const f of fields) {
    const v = raw[f.key];
    const empty = v === undefined || v === null || String(v).trim() === '';
    if (empty) {
      if (f.required) throw new HttpError(400, `${f.label} is required`);
      continue;
    }
    if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${f.label} must be a number`);
      form[f.key] = n;
    } else if (f.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new HttpError(400, `${f.label} must be a date (YYYY-MM-DD)`);
      form[f.key] = String(v);
    } else {
      form[f.key] = String(v).trim().slice(0, 2000);
    }
  }
  return form;
}

export const todayIST = (ms = Date.now()) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** The delegate covering for a person today, if any (latest delegation wins). */
export function activeDelegate(db: DB, userId: string, day = todayIST()): string | null {
  return (
    (db
      .prepare('SELECT delegate_id FROM delegations WHERE user_id = ? AND starts_on <= ? AND ends_on >= ? ORDER BY id DESC LIMIT 1')
      .pluck()
      .get(userId, day, day) as string | undefined) ?? null
  );
}

/** Role → person, then → their delegate if they are away today. */
export function resolveAssignee(db: DB, role: Role, departmentId: string, studentId?: string) {
  const holder = resolveRole(db, role, departmentId, studentId);
  const delegate = activeDelegate(db, holder);
  return delegate ? { assignee: delegate, onBehalfOf: holder } : { assignee: holder, onBehalfOf: null };
}

/**
 * Resolve a role to the person holding it in a department (role, not name). If the student has connected with a
 * holder of that role, that person; otherwise the most recently joined holder (so new staff sign-ups take over).
 */
export function resolveRole(db: DB, role: Role, departmentId: string, studentId?: string): string {
  const connected = studentId
    ? (db
        .prepare(
          `SELECT r.user_id FROM user_roles r JOIN connections c ON c.staff_id = r.user_id AND c.student_id = ? AND c.status = 'accepted'
            WHERE r.role = ? AND r.department_id = ? ORDER BY c.responded_at DESC LIMIT 1`,
        )
        .pluck()
        .get(studentId, role, departmentId) as string | undefined)
    : undefined;
  const id =
    connected ??
    (db
      .prepare('SELECT r.user_id FROM user_roles r JOIN users u ON u.id = r.user_id WHERE r.role = ? AND r.department_id = ? ORDER BY u.created_at DESC, r.rowid DESC LIMIT 1')
      .pluck()
      .get(role, departmentId) as string | undefined);
  if (!id) throw new HttpError(422, `No ${ROLE_LABEL[role]} is set up for this department`);
  return id;
}

function nextRequestId(db: DB) {
  const year = new Date().getFullYear();
  const prefix = `PLC-${year}-`;
  const last = db.prepare('SELECT id FROM requests WHERE id LIKE ? ORDER BY id DESC LIMIT 1').pluck().get(`${prefix}%`) as string | undefined;
  const n = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(4, '0');
}

/** Fingerprint of what approvers sign: the form, plus the SHA-256 of every attachment when there are any. */
export const formHash = (form: Form, attachments: string[] = []) =>
  sha256Hex(canonicalJson(attachments.length ? { form, attachments } : form));

/** Attachment hashes that belong to a version (everything attached up to and including it). */
export const versionAttachments = (db: DB, requestId: string, version: number) =>
  db.prepare('SELECT sha256 FROM attachments WHERE request_id = ? AND version <= ? ORDER BY created_at, id').pluck().all(requestId, version) as string[];

const MAX_ATTACHMENTS = 5;

/**
 * Attach documents from the student's library to a request version. The library keeps its copy (documents are
 * reusable); the request gets its own row pointing at the same stored file and hash.
 */
function claimAttachments(db: DB, ownerId: string, ids: unknown, requestId: string, version: number) {
  if (ids === undefined || ids === null) return 0;
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) throw new HttpError(400, 'Attachments must be a list of document ids');
  const unique = [...new Set(ids as string[])];
  const already = db.prepare('SELECT COUNT(*) FROM attachments WHERE request_id = ?').pluck().get(requestId) as number;
  if (already + unique.length > MAX_ATTACHMENTS) throw new HttpError(400, `At most ${MAX_ATTACHMENTS} attachments per request`);
  const copy = db.prepare(
    'INSERT INTO attachments (id, owner_id, request_id, version, name, mime, size, sha256, path, created_at) SELECT ?, owner_id, ?, ?, name, mime, size, sha256, path, ? FROM attachments WHERE id = ?',
  );
  for (const id of unique) {
    const a = db.prepare('SELECT owner_id, request_id FROM attachments WHERE id = ?').get(id) as { owner_id: string; request_id: string | null } | undefined;
    if (!a || a.owner_id !== ownerId || a.request_id) throw new HttpError(400, 'Unknown document');
    copy.run(randomUUID(), requestId, version, now(), id);
  }
  return unique.length;
}

/**
 * Create one approval row per role in `steps` for this round. The lowest step opens (pending); later steps wait.
 * Used for submit and resubmit now, and for amendments later with only the affected steps.
 */
function createRound(db: DB, req: RequestRow, steps: { stepNo: number; role: Role }[]): string[] {
  const first = Math.min(...steps.map((s) => s.stepNo));
  const ins = db.prepare(
    'INSERT INTO approvals (request_id, version, round, step_no, role, assignee_id, on_behalf_of, decision, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const t = now();
  const openNow: string[] = [];
  for (const s of steps) {
    const open = s.stepNo === first;
    const { assignee, onBehalfOf } =
      s.role === 'recipient'
        ? (() => {
            if (!req.recipient_id) throw new HttpError(400, 'Pick who to send it to');
            const away = activeDelegate(db, req.recipient_id);
            return away ? { assignee: away, onBehalfOf: req.recipient_id } : { assignee: req.recipient_id, onBehalfOf: null };
          })()
        : resolveAssignee(db, s.role, req.department_id, req.student_id);
    ins.run(req.id, req.current_version, req.round, s.stepNo, s.role, assignee, onBehalfOf, open ? 'pending' : 'waiting', open ? t : null);
    if (open) openNow.push(assignee);
  }
  return openNow;
}

function titleOf(db: DB, requestId: string, version: number) {
  const f = JSON.parse(db.prepare('SELECT form_json FROM request_versions WHERE request_id = ? AND version = ?').pluck().get(requestId, version) as string);
  return String(f.title ?? requestId);
}

function askToApprove(db: DB, people: string[], requestId: string, version: number, amendment = false) {
  const title = titleOf(db, requestId, version);
  notify(
    db,
    people,
    amendment ? 'amendment_needed' : 'approval_needed',
    amendment ? `Amendment to approve: ${title} (v${version})` : `Approval needed: ${title}`,
    `${amendment ? `An approved request was amended (v${version}). Only the parts that changed need your signature.` : 'A request is waiting for your approval.'}\n\nOpen: ${link('/inbox')}\nRequest: ${requestId}`,
    requestId,
  );
}

export function submitRequest(db: DB, studentId: string, typeCode: string, input: unknown, attachmentIds?: unknown, recipientId?: unknown, chain?: unknown) {
  const type = getType(db, typeCode);
  const form = cleanForm(type.fields, input);
  const custom = type.code === 'custom' ? customChain(type.fields, chain) : null;
  const steps = custom ?? type.steps;
  const direct = type.steps.some((s) => s.role === 'recipient');
  if (direct) {
    if (typeof recipientId !== 'string' || recipientId === studentId || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(recipientId))
      throw new HttpError(400, 'Pick who to send it to');
    if (!Array.isArray(attachmentIds) || !attachmentIds.length) throw new HttpError(400, 'Attach at least one document');
  }
  const student = db.prepare('SELECT department_id FROM users WHERE id = ?').get(studentId) as { department_id: string };
  return db.transaction(() => {
    const t = now();
    const req: RequestRow = {
      id: nextRequestId(db),
      student_id: studentId,
      department_id: student.department_id,
      type: type.code,
      status: 'in_review',
      current_version: 1,
      round: 1,
      created_at: t,
      updated_at: t,
      recipient_id: direct ? (recipientId as string) : null,
    };
    db.prepare(
      'INSERT INTO requests (id, student_id, department_id, type, status, current_version, round, created_at, updated_at, recipient_id) VALUES (@id, @student_id, @department_id, @type, @status, @current_version, @round, @created_at, @updated_at, @recipient_id)',
    ).run(req);
    const files = claimAttachments(db, studentId, attachmentIds, req.id, 1);
    db.prepare('INSERT INTO request_versions (request_id, version, form_json, form_hash, created_at) VALUES (?, 1, ?, ?, ?)').run(
      req.id, JSON.stringify(form), formHash(form, versionAttachments(db, req.id, 1)), t,
    );
    if (custom) {
      const route = db.prepare('INSERT INTO request_routes (request_id, step_no, role, affected_by_json) VALUES (?, ?, ?, ?)');
      for (const s of custom) route.run(req.id, s.stepNo, s.role, JSON.stringify(s.affectedBy));
    }
    askToApprove(db, createRound(db, req, steps), req.id, 1);
    audit(db, req.id, studentId, 'submitted', 1, { type: type.code, attachments: files });
    return req.id;
  })();
}

export function resubmitRequest(db: DB, studentId: string, requestId: string, input: unknown, attachmentIds?: unknown) {
  const req = getRow(db, requestId);
  if (req.student_id !== studentId) throw new HttpError(403, 'Not your request');
  if (req.status !== 'returned') throw new HttpError(409, 'Only a returned request can be resubmitted');
  const type = getType(db, req.type);
  const form = cleanForm(type.fields, input);
  const before = JSON.parse(db.prepare('SELECT form_json FROM request_versions WHERE request_id = ? AND version = ?').pluck().get(req.id, req.current_version) as string) as Form;
  const changed = type.fields.map((f) => f.key).filter((k) => String(form[k] ?? '') !== String(before[k] ?? ''));
  if (Array.isArray(attachmentIds) && attachmentIds.length) changed.push('attachments');
  // Who reviews again: whoever returned it, anyone who had not approved yet, and any approver whose part changed.
  // Everyone else keeps their approval (a "carried" row pointing at the signature they gave before the return).
  const prev = db
    .prepare('SELECT id, role, decision, carried_from FROM approvals WHERE request_id = ? AND round = ?')
    .all(req.id, req.round) as { id: number; role: Role; decision: Decision; carried_from: number | null }[];
  const prevOf = (role: Role) => prev.find((p) => p.role === role);
  const steps = stepsOf(db, req);
  const keep = steps.filter((s) => {
    const p = prevOf(s.role);
    return p && (p.decision === 'approved' || p.decision === 'carried') && !s.affectedBy.some((f) => changed.includes(f));
  });
  const redo = steps.filter((s) => !keep.includes(s));
  db.transaction(() => {
    const t = now();
    claimAttachments(db, studentId, attachmentIds, req.id, req.current_version);
    db.prepare('UPDATE request_versions SET form_json = ?, form_hash = ? WHERE request_id = ? AND version = ?').run(
      JSON.stringify(form), formHash(form, versionAttachments(db, req.id, req.current_version)), req.id, req.current_version,
    );
    db.prepare("UPDATE requests SET status = 'in_review', round = round + 1, updated_at = ? WHERE id = ?").run(t, req.id);
    const round = req.round + 1;
    askToApprove(db, createRound(db, { ...req, round }, redo), req.id, req.current_version);
    const carry = db.prepare(
      "INSERT INTO approvals (request_id, version, round, step_no, role, assignee_id, on_behalf_of, decision, carried_from) SELECT request_id, ?, ?, step_no, role, assignee_id, on_behalf_of, 'carried', ? FROM approvals WHERE id = ?",
    );
    for (const s of keep) {
      const p = prevOf(s.role)!;
      carry.run(req.current_version, round, p.decision === 'carried' ? p.carried_from : p.id, p.id);
    }
    audit(db, req.id, studentId, 'resubmitted', req.current_version, { round, changed, reapprove: redo.map((s) => s.role), kept: keep.map((s) => s.role) });
  })();
}

/** Record a decision. Returns true when this decision completed the chain (the caller then seals). */
export async function decide(db: DB, userId: string, approvalId: number, decision: unknown, comment: unknown, pin: unknown): Promise<boolean> {
  if (decision !== 'approved' && decision !== 'rejected' && decision !== 'returned') throw new HttpError(400, 'Decision must be approved, rejected or returned');
  const a = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId) as ApprovalRow | undefined;
  if (!a || a.assignee_id !== userId) throw new HttpError(404, 'Not in your inbox');
  if (a.decision !== 'pending') throw new HttpError(409, a.decision === 'waiting' ? 'Earlier steps are not done yet' : 'Already decided');
  const user = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(userId) as { pin_hash: string };
  if (typeof pin !== 'string' || !bcrypt.compareSync(pin, user.pin_hash)) throw new HttpError(401, 'Wrong PIN');
  const note = typeof comment === 'string' && comment.trim() ? comment.trim().slice(0, 1000) : null;
  if (decision !== 'approved' && !note) throw new HttpError(400, 'Add a short comment so the student knows why');

  const version = db.prepare('SELECT form_hash FROM request_versions WHERE request_id = ? AND version = ?').get(a.request_id, a.version) as { form_hash: string };
  const signedAt = now();
  const { privateKey } = await issuerKey(db);
  const onBehalfOf = (db.prepare('SELECT on_behalf_of FROM approvals WHERE id = ?').pluck().get(a.id) as string | null) ?? undefined;
  const signature = await signJson(
    { requestId: a.request_id, version: a.version, role: a.role, approverId: userId, onBehalfOf, decision, formHash: version.form_hash, signedAt },
    privateKey,
  );
  const student = db.prepare('SELECT student_id FROM requests WHERE id = ?').pluck().get(a.request_id) as string;
  const title = titleOf(db, a.request_id, a.version);

  return db.transaction(() => {
    db.prepare('UPDATE approvals SET decision = ?, comment = ?, signed_at = ?, signature = ? WHERE id = ?').run(decision, note, signedAt, signature, a.id);
    audit(db, a.request_id, userId, decision, a.version, { role: a.role, comment: note });
    const round = 'request_id = ? AND round = ?';
    if (decision !== 'approved') {
      // Reject ends the request; return sends it back to the student. Either way the rest of the round is cancelled.
      db.prepare(`UPDATE approvals SET decision = 'cancelled' WHERE ${round} AND decision IN ('pending', 'waiting')`).run(a.request_id, a.round);
      const status = db.prepare('SELECT status FROM requests WHERE id = ?').pluck().get(a.request_id);
      if (status === 'amending') {
        // Only the amendment ends: the previous version stays sealed and valid.
        const prevRound = db.prepare('SELECT MAX(round) FROM approvals WHERE request_id = ? AND version = ?').pluck().get(a.request_id, a.version - 1);
        db.prepare("UPDATE requests SET status = 'sealed', current_version = ?, round = ?, updated_at = ? WHERE id = ?").run(a.version - 1, prevRound, signedAt, a.request_id);
        audit(db, a.request_id, userId, `amendment_${decision}`, a.version, { role: a.role, comment: note });
        notify(db, student, 'amendment_returned', `Amendment ${decision}: ${title}`, `${ROLE_LABEL[a.role]} ${decision} your amendment (v${a.version}): "${note}"\nYour approved v${a.version - 1} is still valid.\n\n${link(`/requests/${a.request_id}`)}`, a.request_id);
        return false;
      }
      db.prepare('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?').run(decision, signedAt, a.request_id);
      notify(db, student, decision, `${decision === 'returned' ? 'Returned for changes' : 'Rejected'}: ${title}`, `${ROLE_LABEL[a.role]}: "${note}"\n\n${link(`/requests/${a.request_id}`)}`, a.request_id);
      return false;
    }
    const openInStep = db.prepare(`SELECT COUNT(*) FROM approvals WHERE ${round} AND step_no = ? AND decision = 'pending'`).pluck().get(a.request_id, a.round, a.step_no);
    if (openInStep) return false; // parallel partner still pending
    const next = db.prepare(`SELECT MIN(step_no) FROM approvals WHERE ${round} AND decision = 'waiting'`).pluck().get(a.request_id, a.round) as number | null;
    if (next !== null) {
      db.prepare(`UPDATE approvals SET decision = 'pending', opened_at = ? WHERE ${round} AND step_no = ? AND decision = 'waiting'`).run(signedAt, a.request_id, a.round, next);
      db.prepare('UPDATE requests SET updated_at = ? WHERE id = ?').run(signedAt, a.request_id);
      const people = db.prepare(`SELECT assignee_id FROM approvals WHERE ${round} AND step_no = ? AND decision = 'pending'`).pluck().all(a.request_id, a.round, next) as string[];
      askToApprove(db, people, a.request_id, a.version, a.version > 1);
      return false;
    }
    db.prepare("UPDATE requests SET status = 'approved', updated_at = ? WHERE id = ?").run(signedAt, a.request_id);
    audit(db, a.request_id, null, 'fully_approved', a.version);
    return true;
  })();
}

/**
 * Amend a sealed approval instead of starting a new request. Creates version n+1; only the roles whose
 * `affectedBy` fields changed re-approve (in chain order, parallel rules kept); every other role gets a
 * "carried" row pointing at the approval it carries, so history shows who approved which version.
 * Version n stays sealed and valid until n+1 is sealed.
 */
export function amendRequest(db: DB, studentId: string, requestId: string, changes: unknown, reason: unknown, attachmentIds?: unknown) {
  const req = getRow(db, requestId);
  if (req.student_id !== studentId) throw new HttpError(403, 'Not your request');
  if (req.status !== 'sealed') throw new HttpError(409, req.status === 'amending' ? 'An amendment is already in review' : 'Only a signed approval can be amended');
  if (typeof reason !== 'string' || !reason.trim()) throw new HttpError(400, 'Say briefly why it changed');
  if (!changes || typeof changes !== 'object') throw new HttpError(400, 'Nothing changed');
  const type = getType(db, req.type);
  const known = new Set(type.fields.map((f) => f.key));
  for (const k of Object.keys(changes)) if (!known.has(k)) throw new HttpError(400, `${k} cannot be amended`);
  // (attachments are passed separately and count as a change to "attachments")

  const before = JSON.parse(db.prepare('SELECT form_json FROM request_versions WHERE request_id = ? AND version = ?').pluck().get(req.id, req.current_version) as string) as Form;
  const after = cleanForm(type.fields, { ...before, ...(changes as object) });
  const changed = type.fields.map((f) => f.key).filter((k) => String(after[k] ?? '') !== String(before[k] ?? ''));
  if (Array.isArray(attachmentIds) && attachmentIds.length) changed.push('attachments');
  if (!changed.length) throw new HttpError(400, 'Nothing changed');
  const steps = stepsOf(db, req);
  const affected = steps.filter((s) => s.affectedBy.some((f) => changed.includes(f)));
  if (!affected.length) throw new HttpError(400, 'This change does not need an amendment');
  const kept = steps.filter((s) => !affected.includes(s));

  const version = req.current_version + 1;
  const round = (db.prepare('SELECT MAX(round) FROM approvals WHERE request_id = ?').pluck().get(req.id) as number) + 1;
  db.transaction(() => {
    const t = now();
    // Files from an earlier, abandoned attempt at this version are released first.
    db.prepare('UPDATE attachments SET request_id = NULL, version = NULL WHERE request_id = ? AND version >= ?').run(req.id, version);
    claimAttachments(db, studentId, attachmentIds, req.id, version);
    db.prepare('INSERT OR REPLACE INTO request_versions (request_id, version, form_json, form_hash, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      req.id, version, JSON.stringify(after), formHash(after, versionAttachments(db, req.id, version)), reason.trim().slice(0, 500), t,
    );
    db.prepare("UPDATE requests SET status = 'amending', current_version = ?, round = ?, updated_at = ? WHERE id = ?").run(version, round, t, req.id);
    askToApprove(db, createRound(db, { ...req, current_version: version, round }, affected), req.id, version, true);
    const prevRound = db.prepare('SELECT MAX(round) FROM approvals WHERE request_id = ? AND version = ?').pluck().get(req.id, req.current_version);
    const carry = db.prepare(
      "INSERT INTO approvals (request_id, version, round, step_no, role, assignee_id, decision, carried_from) VALUES (?, ?, ?, ?, ?, ?, 'carried', ?)",
    );
    for (const s of kept) {
      const src = db
        .prepare("SELECT id, assignee_id, decision, carried_from FROM approvals WHERE request_id = ? AND version = ? AND round = ? AND role = ? AND decision IN ('approved', 'carried')")
        .get(req.id, req.current_version, prevRound, s.role) as { id: number; assignee_id: string; decision: string; carried_from: number | null };
      // Always point at the approval that was actually signed, even across several amendments.
      carry.run(req.id, version, round, s.stepNo, s.role, src.assignee_id, src.decision === 'carried' ? src.carried_from : src.id);
    }
    audit(db, req.id, studentId, 'amendment_requested', version, {
      changed,
      reapprove: affected.map((s) => s.role),
      carried: kept.map((s) => s.role),
      reason: reason.trim(),
    });
  })();
}

/**
 * Reopen a rejected request for changes (a reject is otherwise final). Allowed for the approver who rejected
 * it, or the HoD / Dean SA of the department. The request becomes "returned", so the student edits and
 * resubmits; the resubmission routes like any other return.
 */
export function reopenRequest(db: DB, userId: string, requestId: string, reason: unknown, pin: unknown) {
  const req = getRow(db, requestId);
  if (req.status !== 'rejected') throw new HttpError(409, 'Only a rejected request can be reopened');
  const rejecter = db.prepare("SELECT assignee_id, role FROM approvals WHERE request_id = ? AND round = ? AND decision = 'rejected'").get(req.id, req.round) as
    | { assignee_id: string; role: Role }
    | undefined;
  const senior = db
    .prepare("SELECT role FROM user_roles WHERE user_id = ? AND department_id = ? AND role IN ('hod', 'dean_sa') ORDER BY role DESC LIMIT 1")
    .pluck()
    .get(userId, req.department_id) as Role | undefined;
  const role = rejecter?.assignee_id === userId ? rejecter.role : senior;
  if (!role) throw new HttpError(403, 'Only the approver who rejected it, the HoD or the Dean can reopen it');
  const user = db.prepare('SELECT pin_hash, name FROM users WHERE id = ?').get(userId) as { pin_hash: string; name: string };
  if (typeof pin !== 'string' || !bcrypt.compareSync(pin, user.pin_hash)) throw new HttpError(401, 'Wrong PIN');
  if (typeof reason !== 'string' || !reason.trim()) throw new HttpError(400, 'Tell the student what to change');
  const note = reason.trim().slice(0, 1000);
  db.transaction(() => {
    db.prepare("UPDATE requests SET status = 'returned', updated_at = ? WHERE id = ?").run(now(), req.id);
    audit(db, req.id, userId, 'reopened', req.current_version, { role, reason: note });
    notify(db, req.student_id, 'reopened', `Reopened: ${titleOf(db, req.id, req.current_version)}`, `${user.name} (${ROLE_LABEL[role]}) reopened your rejected request: "${note}"\nEdit it and resubmit.\n\n${link(`/requests/${req.id}`)}`, req.id);
  })();
}

/** Discussion on a request. Anyone who can see the request can read and post. */
export function listComments(db: DB, requestId: string): RequestComment[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.version, c.body, c.created_at, u.id AS uid, u.name,
              (SELECT role FROM user_roles WHERE user_id = u.id ORDER BY rowid LIMIT 1) AS role
         FROM comments c JOIN users u ON u.id = c.author_id WHERE c.request_id = ? ORDER BY c.id`,
    )
    .all(requestId) as { id: number; version: number; body: string; created_at: string; uid: string; name: string; role: Role }[];
  return rows.map((r) => ({ id: r.id, version: r.version, body: r.body, at: r.created_at, author: { id: r.uid, name: r.name, role: r.role, roleLabel: ROLE_LABEL[r.role] } }));
}

/**
 * Post to the discussion. A student's message goes to whoever holds the request now and to whoever returned or
 * rejected it last; a staff message goes to the student. The discussion never changes the approval itself.
 */
export function addComment(db: DB, userId: string, requestId: string, body: unknown) {
  if (typeof body !== 'string' || !body.trim()) throw new HttpError(400, 'Write a message');
  const text = body.trim().slice(0, 2000);
  const req = getRow(db, requestId);
  db.transaction(() => {
    db.prepare('INSERT INTO comments (request_id, author_id, version, body, created_at) VALUES (?, ?, ?, ?, ?)').run(req.id, userId, req.current_version, text, now());
    const author = db.prepare('SELECT name FROM users WHERE id = ?').pluck().get(userId) as string;
    const title = titleOf(db, req.id, req.current_version);
    let to: string[];
    if (userId === req.student_id) {
      const holders = db.prepare("SELECT assignee_id FROM approvals WHERE request_id = ? AND decision = 'pending'").pluck().all(req.id) as string[];
      const last = db
        .prepare("SELECT assignee_id FROM approvals WHERE request_id = ? AND decision IN ('returned', 'rejected') ORDER BY signed_at DESC LIMIT 1")
        .pluck()
        .get(req.id) as string | undefined;
      to = [...holders, ...(last ? [last] : [])];
    } else to = [req.student_id];
    notify(db, to.filter((u) => u !== userId), 'comment', `${author} on ${title}`, `"${text.slice(0, 500)}"\n\nReply: ${link(`/requests/${req.id}`)}`, req.id);
    audit(db, req.id, userId, 'commented', req.current_version, {});
  })();
}

// ---------- reads ----------

function getRow(db: DB, id: string): RequestRow {
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as RequestRow | undefined;
  if (!r) throw new HttpError(404, 'Request not found');
  return r;
}

export function canView(db: DB, userId: string, roles: Role[], requestId: string) {
  const r = getRow(db, requestId);
  if (r.student_id === userId || roles.includes('admin')) return true;
  return !!db.prepare('SELECT 1 FROM approvals WHERE request_id = ? AND (assignee_id = ? OR on_behalf_of = ?) LIMIT 1').get(requestId, userId, userId);
}

function summarize(db: DB, r: RequestRow): RequestSummary {
  const type = db.prepare('SELECT name FROM request_types WHERE code = ?').pluck().get(r.type) as string;
  const form = JSON.parse(db.prepare('SELECT form_json FROM request_versions WHERE request_id = ? AND version = ?').pluck().get(r.id, r.current_version) as string);
  const student = db.prepare('SELECT id, name, title FROM users WHERE id = ?').get(r.student_id) as RequestSummary['student'];
  const dept = db.prepare('SELECT name FROM departments WHERE id = ?').pluck().get(r.department_id) as string;
  const pending = db
    .prepare(
      "SELECT a.role, a.opened_at, u.name FROM approvals a JOIN users u ON u.id = a.assignee_id WHERE a.request_id = ? AND a.round = ? AND a.decision = 'pending' ORDER BY a.step_no, a.id",
    )
    .all(r.id, r.round) as { role: Role; opened_at: string; name: string }[];
  return {
    id: r.id,
    type: r.type,
    typeName: type,
    title: String(form.title ?? type),
    status: r.status,
    version: r.current_version,
    student,
    department: dept,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    withNow: pending.map((p) => ({ role: p.role, roleLabel: ROLE_LABEL[p.role], name: p.name, since: p.opened_at })),
  };
}

export function getDetail(db: DB, id: string): RequestDetail {
  const r = getRow(db, id);
  const rows = db
    .prepare(
      `SELECT a.*, u.name AS assignee_name, src.version AS src_version, ob.name AS on_behalf_name
         FROM approvals a JOIN users u ON u.id = a.assignee_id LEFT JOIN approvals src ON src.id = a.carried_from
         LEFT JOIN users ob ON ob.id = a.on_behalf_of
        WHERE a.request_id = ? AND a.round = ? ORDER BY a.step_no, a.id`,
    )
    .all(r.id, r.round) as (ApprovalRow & { assignee_name: string; src_version: number | null; on_behalf_of: string | null; on_behalf_name: string | null; nudged_at: string | null; escalated_at: string | null })[];
  const timeline: TimelineStep[] = rows.map((a) => ({
    approvalId: a.id,
    stepNo: a.step_no,
    role: a.role,
    roleLabel: ROLE_LABEL[a.role],
    assignee: { id: a.assignee_id, name: a.assignee_name },
    onBehalfOf: a.on_behalf_of ? { id: a.on_behalf_of, name: a.on_behalf_name! } : null,
    overdue: a.decision === 'pending' && !!a.nudged_at,
    escalated: a.decision === 'pending' && !!a.escalated_at,
    decision: a.decision,
    comment: a.comment,
    openedAt: a.opened_at,
    signedAt: a.signed_at,
    version: a.version,
    carriedFromVersion: a.src_version,
  }));
  const last = db
    .prepare("SELECT role, decision, comment, version FROM approvals WHERE request_id = ? AND comment IS NOT NULL ORDER BY signed_at DESC, id DESC LIMIT 1")
    .get(r.id) as RequestDetail['lastComment'] | undefined;
  const versionRow = (v: number) => db.prepare('SELECT form_json, reason FROM request_versions WHERE request_id = ? AND version = ?').get(r.id, v) as { form_json: string; reason: string | null };
  const cur = versionRow(r.current_version);
  const form = JSON.parse(cur.form_json) as Form;
  const fields = getType(db, r.type).fields;
  let amendment: RequestDetail['amendment'] = null;
  if (r.current_version > 1) {
    const previous = JSON.parse(versionRow(r.current_version - 1).form_json) as Form;
    amendment = {
      fromVersion: r.current_version - 1,
      reason: cur.reason ?? '',
      previous,
      changed: fields.map((f) => f.key).filter((k) => String(form[k] ?? '') !== String(previous[k] ?? '')),
    };
  }
  return {
    ...summarize(db, r),
    form,
    fields,
    timeline,
    lastComment: last ?? null,
    seal: null,
    attachments: db
      .prepare('SELECT id, name, mime, size, sha256, version FROM attachments WHERE request_id = ? AND version <= ? ORDER BY created_at, id')
      .all(r.id, r.current_version) as RequestDetail['attachments'],
    revocation: null,
    reopened: reopenInfo(db, r),
    commentCount: db.prepare('SELECT COUNT(*) FROM comments WHERE request_id = ?').pluck().get(r.id) as number,
    amendment,
    chain: stepsOf(db, r),
  };
}

/** The latest reopen, if it came after the latest rejection (i.e. it is what the student is acting on now). */
function reopenInfo(db: DB, r: RequestRow): RequestDetail['reopened'] {
  if (r.status !== 'returned') return null;
  const row = db
    .prepare("SELECT l.details_json, l.at, u.name FROM audit_log l JOIN users u ON u.id = l.actor_id WHERE l.request_id = ? AND l.action = 'reopened' ORDER BY l.id DESC LIMIT 1")
    .get(r.id) as { details_json: string; at: string; name: string } | undefined;
  if (!row) return null;
  const lastReturn = db.prepare("SELECT MAX(at) FROM audit_log WHERE request_id = ? AND action = 'returned'").pluck().get(r.id) as string | null;
  if (lastReturn && lastReturn > row.at) return null;
  const d = JSON.parse(row.details_json) as { role: Role; reason: string };
  return { role: d.role, roleLabel: ROLE_LABEL[d.role], name: row.name, reason: d.reason, at: row.at };
}

export function listAll(db: DB) {
  const rows = db.prepare('SELECT * FROM requests ORDER BY created_at DESC').all() as RequestRow[];
  return rows.map((r) => summarize(db, r));
}

export function listMine(db: DB, studentId: string) {
  const rows = db.prepare('SELECT * FROM requests WHERE student_id = ? ORDER BY created_at DESC').all(studentId) as RequestRow[];
  return rows.map((r) => summarize(db, r));
}

export function inbox(db: DB, userId: string) {
  const rows = db
    .prepare("SELECT id, request_id, role FROM approvals WHERE assignee_id = ? AND decision = 'pending' ORDER BY opened_at, id")
    .all(userId) as { id: number; request_id: string; role: Role }[];
  return rows.map((a) => ({ ...getDetail(db, a.request_id), approvalId: a.id, myRole: a.role }));
}
