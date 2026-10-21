import bcrypt from 'bcryptjs';
import { ROLE_LABEL, APPROVER_ROLES, type AuditEntry, type Delegation, type OutboxEntry, type Role, type Stats } from '@plc/shared';
import type { DB } from './db.js';
import { HttpError } from './errors.js';
import { link, notify } from './notify.js';
import { audit, decide, resolveRole, todayIST } from './workflow.js';

// ---------- delegation ----------

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "I'm away from .. to ..; send my approvals to <colleague>." Approvals already waiting for the person move to
 * the delegate now; new ones are routed to the delegate while the delegation is active. The delegate signs
 * on behalf of the original holder, and the timeline and signature record that.
 */
export function createDelegation(db: DB, userId: string, delegateId: unknown, startsOn: unknown, endsOn: unknown) {
  if (typeof delegateId !== 'string' || delegateId === userId) throw new HttpError(400, 'Pick a colleague');
  if (typeof startsOn !== 'string' || typeof endsOn !== 'string' || !DAY.test(startsOn) || !DAY.test(endsOn) || endsOn < startsOn)
    throw new HttpError(400, 'Pick a valid date range');
  if (endsOn < todayIST()) throw new HttpError(400, 'That range is already over');
  const me = db.prepare('SELECT department_id FROM users WHERE id = ?').get(userId) as { department_id: string };
  const ok = db
    .prepare(`SELECT 1 FROM users u JOIN user_roles r ON r.user_id = u.id WHERE u.id = ? AND u.department_id = ? AND r.role IN (${APPROVER_ROLES.map(() => '?').join(',')})`)
    .get(delegateId, me.department_id, ...APPROVER_ROLES);
  if (!ok) throw new HttpError(400, 'The delegate must be a staff member of your department');

  return db.transaction(() => {
    const id = db.prepare('INSERT INTO delegations (user_id, delegate_id, starts_on, ends_on, created_at) VALUES (?, ?, ?, ?, ?)').run(
      userId, delegateId, startsOn, endsOn, new Date().toISOString(),
    ).lastInsertRowid as number;
    let moved = 0;
    if (startsOn <= todayIST()) {
      moved = db
        .prepare("UPDATE approvals SET assignee_id = ?, on_behalf_of = ? WHERE assignee_id = ? AND decision IN ('pending', 'waiting')")
        .run(delegateId, userId, userId).changes;
    }
    const name = db.prepare('SELECT name FROM users WHERE id = ?').pluck().get(userId) as string;
    notify(db, delegateId, 'delegated', `You are covering for ${name}`, `${name} is away ${startsOn} to ${endsOn}. Their approvals come to you meanwhile${moved ? ` (${moved} moved to you now)` : ''}.\n\n${link('/inbox')}`);
    audit(db, null, userId, 'delegation_created', null, { delegateId, startsOn, endsOn, moved });
    return { id, moved };
  })();
}

export function myDelegations(db: DB, userId: string): Delegation[] {
  return (
    db
      .prepare(
        `SELECT d.id, d.starts_on, d.ends_on, u.id AS uid, u.name, u.title FROM delegations d JOIN users u ON u.id = d.delegate_id
          WHERE d.user_id = ? AND d.ends_on >= ? ORDER BY d.starts_on`,
      )
      .all(userId, todayIST()) as { id: number; starts_on: string; ends_on: string; uid: string; name: string; title: string }[]
  ).map((d) => ({ id: d.id, startsOn: d.starts_on, endsOn: d.ends_on, delegate: { id: d.uid, name: d.name, title: d.title } }));
}

/** End a delegation. Items the delegate still holds go back to the original person. */
export function endDelegation(db: DB, userId: string, id: number) {
  const d = db.prepare('SELECT * FROM delegations WHERE id = ? AND user_id = ?').get(id, userId) as { delegate_id: string } | undefined;
  if (!d) throw new HttpError(404, 'Not found');
  db.transaction(() => {
    db.prepare('DELETE FROM delegations WHERE id = ?').run(id);
    db.prepare("UPDATE approvals SET assignee_id = ?, on_behalf_of = NULL WHERE assignee_id = ? AND on_behalf_of = ? AND decision IN ('pending', 'waiting')").run(userId, d.delegate_id, userId);
    audit(db, null, userId, 'delegation_ended', null, { id });
  })();
}

/** Staff in my department who can cover for me. */
export function colleagues(db: DB, userId: string) {
  return db
    .prepare(
      `SELECT DISTINCT u.id, u.name, u.title FROM users u JOIN user_roles r ON r.user_id = u.id
        WHERE u.department_id = (SELECT department_id FROM users WHERE id = ?) AND u.id != ?
          AND r.role IN (${APPROVER_ROLES.map(() => '?').join(',')}) ORDER BY u.name`,
    )
    .all(userId, userId, ...APPROVER_ROLES) as { id: string; name: string; title: string }[];
}

// ---------- deadlines: nudge, then escalate ----------

/** Who hears about a step that is badly overdue. */
const ESCALATE_TO: Partial<Record<Role, Role>> = {
  faculty_coordinator: 'hod',
  security: 'hod',
  librarian: 'hod',
  lab_incharge: 'hod',
  warden: 'hod',
  accounts: 'hod',
  faculty: 'hod',
  hod: 'dean_sa',
  dean_sa: 'admin',
};

/**
 * Past the step's SLA → nudge the assignee. Past twice the SLA → escalate: tell the next authority and flag the
 * step "Escalated" (the request stays with the same person; a standing delegation is how work is re-routed).
 * `slaMinutes` (demo) treats every SLA as that many minutes.
 */
export function runSla(db: DB, nowMs = Date.now(), slaMinutes: number | null = null) {
  const rows = db
    .prepare(
      `SELECT a.id, a.request_id, a.version, a.role, a.assignee_id, a.opened_at, a.nudged_at, a.escalated_at, r.department_id, s.sla_hours,
              v.form_json
         FROM approvals a
         JOIN requests r ON r.id = a.request_id
         JOIN route_steps s ON s.request_type = r.type AND s.role = a.role
         JOIN request_versions v ON v.request_id = a.request_id AND v.version = a.version
        WHERE a.decision = 'pending' AND a.opened_at IS NOT NULL AND (a.nudged_at IS NULL OR a.escalated_at IS NULL)`,
    )
    .all() as {
    id: number; request_id: string; version: number; role: Role; assignee_id: string; opened_at: string; nudged_at: string | null;
    escalated_at: string | null; department_id: string; sla_hours: number; form_json: string;
  }[];
  let nudged = 0;
  let escalated = 0;
  const t = new Date(nowMs).toISOString();
  for (const a of rows) {
    const slaMs = slaMinutes != null ? slaMinutes * 60_000 : a.sla_hours * 3600_000;
    const waited = nowMs - Date.parse(a.opened_at);
    const title = String(JSON.parse(a.form_json).title ?? a.request_id);
    const label = slaMinutes != null ? `${slaMinutes} min` : `${a.sla_hours} h`;
    db.transaction(() => {
      if (!a.nudged_at && waited >= slaMs) {
        db.prepare('UPDATE approvals SET nudged_at = ? WHERE id = ?').run(t, a.id);
        notify(db, a.assignee_id, 'sla_nudge', `Reminder: ${title} is waiting for you`, `This request has waited longer than its ${label} deadline.\n\n${link('/inbox')}`, a.request_id);
        audit(db, a.request_id, null, 'sla_nudge', a.version, { role: a.role, assignee: a.assignee_id });
        nudged++;
      }
      if (!a.escalated_at && waited >= 2 * slaMs) {
        const toRole = ESCALATE_TO[a.role];
        let target: string | null = null;
        if (toRole) {
          try {
            target = toRole === 'admin' ? (db.prepare("SELECT user_id FROM user_roles WHERE role = 'admin' LIMIT 1").pluck().get() as string) : resolveRole(db, toRole, a.department_id);
          } catch {
            target = null;
          }
        }
        db.prepare('UPDATE approvals SET escalated_at = ? WHERE id = ?').run(t, a.id);
        const who = db.prepare('SELECT name FROM users WHERE id = ?').pluck().get(a.assignee_id) as string;
        if (target && target !== a.assignee_id)
          notify(db, target, 'sla_escalated', `Escalated: ${title} is stuck with ${ROLE_LABEL[a.role]}`, `${who} (${ROLE_LABEL[a.role]}) has not acted for over twice the ${label} deadline.\n\n${link(`/requests/${a.request_id}`)}`, a.request_id);
        notify(db, a.assignee_id, 'sla_escalated', `Escalated: ${title}`, `This request is now overdue and has been escalated${toRole ? ` to the ${ROLE_LABEL[toRole]}` : ''}. Away? Set a delegate in your inbox.\n\n${link('/inbox')}`, a.request_id);
        audit(db, a.request_id, null, 'sla_escalated', a.version, { role: a.role, assignee: a.assignee_id, to: toRole ?? null });
        escalated++;
      }
    })();
  }
  return { nudged, escalated };
}

// ---------- batch approve ----------

/** Approve several inbox items with one PIN. Each approval is still signed and audited on its own. */
export async function batchApprove(db: DB, userId: string, ids: unknown, pin: unknown) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some((i) => !Number.isInteger(i))) throw new HttpError(400, 'Pick between 1 and 50 items');
  const user = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(userId) as { pin_hash: string };
  if (typeof pin !== 'string' || !bcrypt.compareSync(pin, user.pin_hash)) throw new HttpError(401, 'Wrong PIN');
  const results: { id: number; ok: boolean; error?: string; completed?: string }[] = [];
  for (const id of ids as number[]) {
    try {
      const done = await decide(db, userId, id, 'approved', null, pin);
      const requestId = db.prepare('SELECT request_id FROM approvals WHERE id = ?').pluck().get(id) as string;
      results.push({ id, ok: true, ...(done ? { completed: requestId } : {}) });
    } catch (e) {
      results.push({ id, ok: false, error: (e as Error).message });
    }
  }
  return results;
}

// ---------- impact stats ----------

// Assumptions from the project overview (section 7 and 8), per approval.
const SHEETS_PER_APPROVAL = 3;
const CO2_G_PER_SHEET = 12.7;
const SHEETS_PER_TREE = 8333;
const WATER_L_PER_SHEET = 0.4;

export function stats(db: DB): Stats {
  const n = (sql: string, ...p: unknown[]) => (db.prepare(sql).pluck().get(...p) as number) ?? 0;
  const digitised = n("SELECT COUNT(DISTINCT request_id) FROM seals WHERE anchor_status = 'anchored'");
  const sheets = digitised * SHEETS_PER_APPROVAL;
  const turnaround = db
    .prepare(`SELECT AVG((julianday(s.created_at) - julianday(r.created_at)) * 24) FROM seals s JOIN requests r ON r.id = s.request_id WHERE s.version = 1`)
    .pluck()
    .get() as number | null;
  const byRole = (
    db
      .prepare(
        `SELECT role,
                SUM(CASE WHEN decision IN ('approved','rejected','returned') THEN 1 ELSE 0 END) AS decided,
                SUM(CASE WHEN decision = 'pending' THEN 1 ELSE 0 END) AS pending,
                AVG(CASE WHEN decision IN ('approved','rejected','returned') AND opened_at IS NOT NULL
                         THEN (julianday(signed_at) - julianday(opened_at)) * 24 END) AS wait
           FROM approvals GROUP BY role HAVING decided + pending > 0 ORDER BY wait DESC`,
      )
      .all() as { role: Role; decided: number; pending: number; wait: number | null }[]
  ).map((r) => ({ role: r.role, roleLabel: ROLE_LABEL[r.role], decided: r.decided, pending: r.pending, avgWaitHours: r.wait }));
  return {
    requests: n('SELECT COUNT(*) FROM requests'),
    digitised,
    inReview: n("SELECT COUNT(*) FROM requests WHERE status IN ('in_review', 'amending')"),
    overdue: n("SELECT COUNT(*) FROM approvals WHERE decision = 'pending' AND nudged_at IS NOT NULL"),
    avgTurnaroundHours: turnaround,
    sheetsSaved: sheets,
    co2Kg: (sheets * CO2_G_PER_SHEET) / 1000,
    trees: sheets / SHEETS_PER_TREE,
    waterLitres: sheets * WATER_L_PER_SHEET,
    byType: db
      .prepare('SELECT r.type, t.name, COUNT(*) AS count FROM requests r JOIN request_types t ON t.code = r.type GROUP BY r.type ORDER BY count DESC')
      .all() as Stats['byType'],
    byRole,
    assumptions: `${SHEETS_PER_APPROVAL} sheets per approval (form, copies, reprints); ${CO2_G_PER_SHEET} g CO2e per sheet (paper production only); ${SHEETS_PER_TREE} sheets per tree; ${WATER_L_PER_SHEET} L water per sheet. Factors from the Environmental Paper Network calculator.`,
  };
}

// ---------- audit + outbox views ----------

export function auditLog(db: DB, limit = 200, requestId?: string): AuditEntry[] {
  const rows = db
    .prepare(
      `SELECT l.id, l.at, l.request_id, u.name AS actor, l.action, l.version, l.details_json FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id
        ${requestId ? 'WHERE l.request_id = ?' : ''} ORDER BY l.id DESC LIMIT ?`,
    )
    .all(...(requestId ? [requestId, limit] : [limit])) as { id: number; at: string; request_id: string | null; actor: string | null; action: string; version: number | null; details_json: string }[];
  return rows.map((r) => ({ id: r.id, at: r.at, requestId: r.request_id, actor: r.actor, action: r.action, version: r.version, details: JSON.parse(r.details_json) }));
}

export function outbox(db: DB, limit = 100): OutboxEntry[] {
  return db
    .prepare('SELECT id, to_addr AS "to", subject, kind, request_id AS requestId, status, created_at AS createdAt, sent_at AS sentAt FROM outbox ORDER BY id DESC LIMIT ?')
    .all(limit) as OutboxEntry[];
}
