import { Router, type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { DESIGNATIONS, ROLES, ROLE_LABEL, type Connection, type Department, type Me, type Person, type Role } from '@plc/shared';
import type { DB } from './db.js';
import { requireAuth, requireRole, signToken } from './auth.js';
import { HttpError } from './errors.js';
import { link, notify } from './notify.js';
import { audit } from './workflow.js';

export const initials = (name: string) =>
  name
    .replace(/^(Prof|Dr|Mr|Ms|Mrs)\.\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const rolesOf = (db: DB, userId: string) =>
  (db.prepare('SELECT DISTINCT role FROM user_roles WHERE user_id = ?').pluck().all(userId) as Role[]).sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b));

type Wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => Promise<void>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

interface UserRow {
  id: string;
  name: string;
  title: string;
  kind: 'student' | 'staff';
  email: string | null;
  phone: string | null;
  employee_id: string | null;
  roll_no: string | null;
  year: string | null;
  bio: string | null;
  department_id: string;
  department: string;
}

const USER_SQL = `SELECT u.id, u.name, u.title, u.kind, u.email, u.phone, u.employee_id, u.roll_no, u.year, u.bio, u.department_id, d.name AS department
  FROM users u JOIN departments d ON d.id = u.department_id`;

export function person(db: DB, u: Pick<UserRow, 'id' | 'name' | 'title' | 'kind' | 'department'>): Person {
  const role = rolesOf(db, u.id)[0] ?? (u.kind === 'student' ? 'student' : 'faculty');
  return { id: u.id, name: u.name, kind: u.kind, role, roleLabel: ROLE_LABEL[role], title: u.title, department: u.department, initials: initials(u.name) };
}

function meOf(db: DB, id: string): Me {
  const u = db.prepare(`${USER_SQL} WHERE u.id = ?`).get(id) as UserRow | undefined;
  if (!u) throw new HttpError(404, 'Profile not found');
  return {
    id: u.id, name: u.name, title: u.title, department: u.department, departmentId: u.department_id, kind: u.kind, email: u.email,
    phone: u.phone, employeeId: u.employee_id, rollNo: u.roll_no, year: u.year, bio: u.bio, roles: rolesOf(db, u.id), initials: initials(u.name),
  };
}

/** Sign up as a student or as staff. Staff pick a designation (= their role). Returns a session token. */
export function signUp(db: DB, body: Record<string, unknown>) {
  const kind = body.kind === 'student' ? 'student' : body.kind === 'staff' ? 'staff' : null;
  if (!kind) throw new HttpError(400, 'Choose student or staff');
  const name = str(body.name, 80);
  if (!name) throw new HttpError(400, 'Name is required');
  const email = str(body.email, 120)?.toLowerCase();
  if (!email || !EMAIL.test(email)) throw new HttpError(400, 'A valid email is required');
  if (typeof body.password !== 'string' || body.password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (typeof body.pin !== 'string' || !/^\d{4}$/.test(body.pin)) throw new HttpError(400, 'Signing PIN must be 4 digits');
  const dept = db.prepare('SELECT id, name FROM departments WHERE id = ?').get(body.departmentId) as Department | undefined;
  if (!dept) throw new HttpError(400, 'Pick your department');
  let role: Role = 'student';
  if (kind === 'staff') {
    if (!DESIGNATIONS.includes(body.designation as Role)) throw new HttpError(400, 'Pick your designation');
    role = body.designation as Role;
  }
  if (db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(email)) throw new HttpError(409, 'An account with this email already exists. Log in instead.');

  const id = `u_${randomUUID().slice(0, 12)}`;
  const title =
    str(body.title, 80) ??
    (kind === 'student' ? [str(body.year, 20), dept.name].filter(Boolean).join(', ') : `${ROLE_LABEL[role]}, ${dept.name}`);
  db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, name, title, department_id, pin_hash, email, password_hash, kind, phone, employee_id, roll_no, year, bio, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, name, title, dept.id, bcrypt.hashSync(body.pin as string, 8), email, bcrypt.hashSync(body.password as string, 10), kind,
      str(body.phone, 20), str(body.employeeId, 40), str(body.rollNo, 40), str(body.year, 20), str(body.bio, 500), new Date().toISOString(),
    );
    db.prepare('INSERT INTO user_roles (user_id, role, department_id) VALUES (?, ?, ?)').run(id, role, dept.id);
    audit(db, null, id, 'signed_up', null, { kind, role, department: dept.id });
  })();
  return { token: signToken({ sub: id, roles: [role] }), roles: [role] };
}

/** Email + password; or, where allowed (dev/tests), the demo-profile id + PIN. */
export function logIn(db: DB, body: Record<string, unknown>, allowPinLogin: boolean) {
  let user: { id: string } | undefined;
  if (typeof body.email === 'string') {
    const u = db.prepare('SELECT id, password_hash FROM users WHERE lower(email) = ?').get(body.email.trim().toLowerCase()) as
      | { id: string; password_hash: string | null }
      | undefined;
    if (u?.password_hash && typeof body.password === 'string' && bcrypt.compareSync(body.password, u.password_hash)) user = u;
    if (!user) throw new HttpError(401, 'Wrong email or password');
  } else {
    if (!allowPinLogin) throw new HttpError(401, 'Log in with email and password');
    const u = db.prepare('SELECT id, pin_hash FROM users WHERE id = ?').get(body.userId) as { id: string; pin_hash: string } | undefined;
    if (u && typeof body.pin === 'string' && bcrypt.compareSync(body.pin, u.pin_hash)) user = u;
    if (!user) throw new HttpError(401, 'Wrong PIN');
  }
  const roles = rolesOf(db, user.id);
  return { token: signToken({ sub: user.id, roles }), roles };
}

// ---------- connections: a student adds a teacher; the teacher accepts ----------

function connectionsOf(db: DB, userId: string, kind: 'student' | 'staff'): Connection[] {
  const other = kind === 'student' ? 'staff_id' : 'student_id';
  const me = kind === 'student' ? 'student_id' : 'staff_id';
  const rows = db
    .prepare(
      `SELECT c.id, c.status, c.created_at, u.id AS uid, u.name, u.title, u.kind, d.name AS department
         FROM connections c JOIN users u ON u.id = c.${other} JOIN departments d ON d.id = u.department_id
        WHERE c.${me} = ? AND c.status != 'declined' ORDER BY c.status, u.name`,
    )
    .all(userId) as { id: number; status: Connection['status']; created_at: string; uid: string; name: string; title: string; kind: 'student' | 'staff'; department: string }[];
  return rows.map((r) => ({ id: r.id, status: r.status, createdAt: r.created_at, person: person(db, { id: r.uid, name: r.name, title: r.title, kind: r.kind, department: r.department }) }));
}

export function accountRoutes(db: DB, opts: { wrap: Wrap; allowPinLogin: boolean; limit: (req: Request, res: Response, next: NextFunction) => void }) {
  const r = Router();
  const { wrap } = opts;
  const kindOf = (id: string) => db.prepare('SELECT kind FROM users WHERE id = ?').pluck().get(id) as 'student' | 'staff';

  r.get('/departments', (_req, res) => res.json(db.prepare('SELECT id, name FROM departments ORDER BY name').all()));
  r.post('/auth/signup', opts.limit, wrap((req, res) => res.status(201).json(signUp(db, req.body ?? {}))));
  r.post('/auth/login', opts.limit, wrap((req, res) => res.json(logIn(db, req.body ?? {}, opts.allowPinLogin))));
  r.get('/me', requireAuth, wrap((req, res) => res.json(meOf(db, req.user!.sub))));
  r.put('/me', requireAuth, wrap((req, res) => {
    const b = req.body ?? {};
    const name = b.name === undefined ? undefined : str(b.name, 80);
    if (name === null) throw new HttpError(400, 'Name is required');
    const fields: [string, unknown][] = [
      ['name', name], ['title', b.title === undefined ? undefined : str(b.title, 80) ?? ''], ['phone', b.phone === undefined ? undefined : str(b.phone, 20)],
      ['employee_id', b.employeeId === undefined ? undefined : str(b.employeeId, 40)], ['roll_no', b.rollNo === undefined ? undefined : str(b.rollNo, 40)],
      ['year', b.year === undefined ? undefined : str(b.year, 20)], ['bio', b.bio === undefined ? undefined : str(b.bio, 500)],
    ];
    for (const [col, v] of fields) if (v !== undefined) db.prepare(`UPDATE users SET ${col} = ? WHERE id = ?`).run(v, req.user!.sub);
    res.json(meOf(db, req.user!.sub));
  }));

  /** Everyone I can send a document to (students and staff), searchable. No contact details. */
  r.get('/people', requireAuth, (req, res) => {
    const q = `%${String(req.query.q ?? '').trim().toLowerCase()}%`;
    const kind = req.query.kind === 'student' || req.query.kind === 'staff' ? req.query.kind : null;
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.title, u.kind, d.name AS department FROM users u JOIN departments d ON d.id = u.department_id
          WHERE u.id != ? AND (? IS NULL OR u.kind = ?)
            AND (lower(u.name) LIKE ? OR lower(u.title) LIKE ? OR lower(d.name) LIKE ?
                 OR EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND lower(r.role) LIKE ?))
          ORDER BY u.kind DESC, u.name LIMIT 60`,
      )
      .all(req.user!.sub, kind, kind, q, q, q, q.replace(/ /g, '_')) as { id: string; name: string; title: string; kind: 'student' | 'staff'; department: string }[];
    res.json(rows.map((u) => person(db, u)).filter((p) => p.role !== 'admin' || kind !== 'student'));
  });

  r.get('/connections', requireAuth, (req, res) => res.json(connectionsOf(db, req.user!.sub, kindOf(req.user!.sub))));

  r.post('/connections', requireAuth, requireRole('student'), wrap((req, res) => {
    const staffId = req.body?.staffId;
    const staff = db.prepare("SELECT id, name FROM users WHERE id = ? AND kind = 'staff'").get(staffId) as { id: string; name: string } | undefined;
    if (!staff) throw new HttpError(400, 'Pick a staff member');
    const existing = db.prepare('SELECT id, status FROM connections WHERE student_id = ? AND staff_id = ?').get(req.user!.sub, staff.id) as { id: number; status: string } | undefined;
    if (existing?.status === 'accepted') throw new HttpError(409, 'Already connected');
    if (existing?.status === 'pending') throw new HttpError(409, 'Request already sent');
    db.transaction(() => {
      if (existing) db.prepare("UPDATE connections SET status = 'pending', created_at = ?, responded_at = NULL WHERE id = ?").run(new Date().toISOString(), existing.id);
      else db.prepare("INSERT INTO connections (student_id, staff_id, status, created_at) VALUES (?, ?, 'pending', ?)").run(req.user!.sub, staff.id, new Date().toISOString());
      const student = db.prepare('SELECT name FROM users WHERE id = ?').pluck().get(req.user!.sub) as string;
      notify(db, staff.id, 'connection', `${student} wants to add you as a teacher`, `Accept to let ${student} send you documents from their dashboard.\n\n${link('/inbox')}`);
    })();
    res.status(201).json(connectionsOf(db, req.user!.sub, 'student'));
  }));

  const respond = (status: 'accepted' | 'declined') =>
    wrap((req, res) => {
      const c = db.prepare('SELECT id, student_id, staff_id, status FROM connections WHERE id = ?').get(Number(req.params.id)) as
        | { id: number; student_id: string; staff_id: string; status: string }
        | undefined;
      if (!c || c.staff_id !== req.user!.sub) throw new HttpError(404, 'Not found');
      if (c.status !== 'pending') throw new HttpError(409, 'Already answered');
      db.transaction(() => {
        db.prepare('UPDATE connections SET status = ?, responded_at = ? WHERE id = ?').run(status, new Date().toISOString(), c.id);
        const staff = db.prepare('SELECT name FROM users WHERE id = ?').pluck().get(c.staff_id) as string;
        notify(db, c.student_id, 'connection', `${staff} ${status === 'accepted' ? 'accepted' : 'declined'} your request`, status === 'accepted' ? `${staff} is now on your dashboard. Send documents with one tap.\n\n${link('/student')}` : `You can still send documents to ${staff} directly.\n\n${link('/student')}`);
      })();
      res.json(connectionsOf(db, req.user!.sub, 'staff'));
    });
  r.post('/connections/:id/accept', requireAuth, respond('accepted'));
  r.post('/connections/:id/decline', requireAuth, respond('declined'));
  r.delete('/connections/:id', requireAuth, wrap((req, res) => {
    const c = db.prepare('SELECT id, student_id, staff_id FROM connections WHERE id = ?').get(Number(req.params.id)) as { id: number; student_id: string; staff_id: string } | undefined;
    if (!c || (c.student_id !== req.user!.sub && c.staff_id !== req.user!.sub)) throw new HttpError(404, 'Not found');
    db.prepare('DELETE FROM connections WHERE id = ?').run(c.id);
    res.json({ ok: true });
  }));
  return r;
}
