import bcrypt from 'bcryptjs';
import { ROLE_LABEL, sha256Hex, canonicalJson, signJson } from '@plc/shared';
import type { Decision, FieldDef, RequestDetail, RequestStatus, RequestSummary, Role, TimelineStep } from '@plc/shared';
import type { DB } from './db.js';
import { HttpError } from './errors.js';
import { issuerKey } from './keys.js';

type Form = Record<string, string | number>;

interface RequestRow {
  id: string;
  student_id: string;
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

/** Resolve a role to the person holding it in a department (role, not name). */
export function resolveRole(db: DB, role: Role, departmentId: string): string {
  const id = db.prepare('SELECT user_id FROM user_roles WHERE role = ? AND department_id = ? ORDER BY rowid LIMIT 1').pluck().get(role, departmentId) as
    | string
    | undefined;
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

const formHash = (form: Form) => sha256Hex(canonicalJson(form));

/**
 * Create one approval row per role in `steps` for this round. The lowest step opens (pending); later steps wait.
 * Used for submit and resubmit now, and for amendments later with only the affected steps.
 */
function createRound(db: DB, req: RequestRow, steps: { stepNo: number; role: Role }[]) {
  const first = Math.min(...steps.map((s) => s.stepNo));
  const ins = db.prepare(
    'INSERT INTO approvals (request_id, version, round, step_no, role, assignee_id, decision, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const t = now();
  for (const s of steps) {
    const open = s.stepNo === first;
    ins.run(req.id, req.current_version, req.round, s.stepNo, s.role, resolveRole(db, s.role, req.department_id), open ? 'pending' : 'waiting', open ? t : null);
  }
}

export function submitRequest(db: DB, studentId: string, typeCode: string, input: unknown) {
  const type = getType(db, typeCode);
  const form = cleanForm(type.fields, input);
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
    };
    db.prepare(
      'INSERT INTO requests (id, student_id, department_id, type, status, current_version, round, created_at, updated_at) VALUES (@id, @student_id, @department_id, @type, @status, @current_version, @round, @created_at, @updated_at)',
    ).run(req);
    db.prepare('INSERT INTO request_versions (request_id, version, form_json, form_hash, created_at) VALUES (?, 1, ?, ?, ?)').run(
      req.id, JSON.stringify(form), formHash(form), t,
    );
    createRound(db, req, type.steps);
    audit(db, req.id, studentId, 'submitted', 1, { type: type.code });
    return req.id;
  })();
}

export function resubmitRequest(db: DB, studentId: string, requestId: string, input: unknown) {
  const req = getRow(db, requestId);
  if (req.student_id !== studentId) throw new HttpError(403, 'Not your request');
  if (req.status !== 'returned') throw new HttpError(409, 'Only a returned request can be resubmitted');
  const type = getType(db, req.type);
  const form = cleanForm(type.fields, input);
  db.transaction(() => {
    const t = now();
    db.prepare('UPDATE request_versions SET form_json = ?, form_hash = ? WHERE request_id = ? AND version = ?').run(
      JSON.stringify(form), formHash(form), req.id, req.current_version,
    );
    db.prepare("UPDATE requests SET status = 'in_review', round = round + 1, updated_at = ? WHERE id = ?").run(t, req.id);
    createRound(db, { ...req, round: req.round + 1 }, type.steps);
    audit(db, req.id, studentId, 'resubmitted', req.current_version, { round: req.round + 1 });
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
  const signature = await signJson(
    { requestId: a.request_id, version: a.version, role: a.role, approverId: userId, decision, formHash: version.form_hash, signedAt },
    privateKey,
  );

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
        return false;
      }
      db.prepare('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?').run(decision, signedAt, a.request_id);
      return false;
    }
    const openInStep = db.prepare(`SELECT COUNT(*) FROM approvals WHERE ${round} AND step_no = ? AND decision = 'pending'`).pluck().get(a.request_id, a.round, a.step_no);
    if (openInStep) return false; // parallel partner still pending
    const next = db.prepare(`SELECT MIN(step_no) FROM approvals WHERE ${round} AND decision = 'waiting'`).pluck().get(a.request_id, a.round) as number | null;
    if (next !== null) {
      db.prepare(`UPDATE approvals SET decision = 'pending', opened_at = ? WHERE ${round} AND step_no = ? AND decision = 'waiting'`).run(signedAt, a.request_id, a.round, next);
      db.prepare('UPDATE requests SET updated_at = ? WHERE id = ?').run(signedAt, a.request_id);
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
export function amendRequest(db: DB, studentId: string, requestId: string, changes: unknown, reason: unknown) {
  const req = getRow(db, requestId);
  if (req.student_id !== studentId) throw new HttpError(403, 'Not your request');
  if (req.status !== 'sealed') throw new HttpError(409, req.status === 'amending' ? 'An amendment is already in review' : 'Only a sealed approval can be amended');
  if (typeof reason !== 'string' || !reason.trim()) throw new HttpError(400, 'Say briefly why it changed');
  if (!changes || typeof changes !== 'object') throw new HttpError(400, 'Nothing changed');
  const type = getType(db, req.type);
  const known = new Set(type.fields.map((f) => f.key));
  for (const k of Object.keys(changes)) if (!known.has(k)) throw new HttpError(400, `${k} cannot be amended`);

  const before = JSON.parse(db.prepare('SELECT form_json FROM request_versions WHERE request_id = ? AND version = ?').pluck().get(req.id, req.current_version) as string) as Form;
  const after = cleanForm(type.fields, { ...before, ...(changes as object) });
  const changed = type.fields.map((f) => f.key).filter((k) => String(after[k] ?? '') !== String(before[k] ?? ''));
  if (!changed.length) throw new HttpError(400, 'Nothing changed');
  const affected = type.steps.filter((s) => s.affectedBy.some((f) => changed.includes(f)));
  if (!affected.length) throw new HttpError(400, 'This change does not need an amendment');
  const kept = type.steps.filter((s) => !affected.includes(s));

  const version = req.current_version + 1;
  const round = (db.prepare('SELECT MAX(round) FROM approvals WHERE request_id = ?').pluck().get(req.id) as number) + 1;
  db.transaction(() => {
    const t = now();
    db.prepare('INSERT OR REPLACE INTO request_versions (request_id, version, form_json, form_hash, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      req.id, version, JSON.stringify(after), formHash(after), reason.trim().slice(0, 500), t,
    );
    db.prepare("UPDATE requests SET status = 'amending', current_version = ?, round = ?, updated_at = ? WHERE id = ?").run(version, round, t, req.id);
    createRound(db, { ...req, current_version: version, round }, affected);
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

// ---------- reads ----------

function getRow(db: DB, id: string): RequestRow {
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as RequestRow | undefined;
  if (!r) throw new HttpError(404, 'Request not found');
  return r;
}

export function canView(db: DB, userId: string, roles: Role[], requestId: string) {
  const r = getRow(db, requestId);
  if (r.student_id === userId || roles.includes('admin')) return true;
  return !!db.prepare('SELECT 1 FROM approvals WHERE request_id = ? AND assignee_id = ? LIMIT 1').get(requestId, userId);
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
      `SELECT a.*, u.name AS assignee_name, src.version AS src_version
         FROM approvals a JOIN users u ON u.id = a.assignee_id LEFT JOIN approvals src ON src.id = a.carried_from
        WHERE a.request_id = ? AND a.round = ? ORDER BY a.step_no, a.id`,
    )
    .all(r.id, r.round) as (ApprovalRow & { assignee_name: string; src_version: number | null })[];
  const timeline: TimelineStep[] = rows.map((a) => ({
    approvalId: a.id,
    stepNo: a.step_no,
    role: a.role,
    roleLabel: ROLE_LABEL[a.role],
    assignee: { id: a.assignee_id, name: a.assignee_name },
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
    revocation: null,
    amendment,
  };
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
