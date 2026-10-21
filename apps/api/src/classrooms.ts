import { Router, type NextFunction, type Request, type Response } from 'express';
import { randomInt, randomUUID } from 'node:crypto';
import { APPROVER_ROLES, type Classroom, type InviteResult } from '@plc/shared';
import type { DB } from './db.js';
import { requireAuth, requireRole } from './auth.js';
import { HttpError } from './errors.js';
import { link, notify } from './notify.js';
import { person } from './accounts.js';

type Wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => Promise<void>;

// No 0/O or 1/I: codes are read out of an email and typed on a phone.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = (db: DB) => {
  for (;;) {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    if (!db.prepare('SELECT 1 FROM classrooms WHERE code = ?').get(code)) return code;
  }
};
const MAX_INVITES = 100;

const USER = `SELECT u.id, u.name, u.title, u.kind, u.email, d.name AS department FROM users u JOIN departments d ON d.id = u.department_id`;
type UserRow = { id: string; name: string; title: string; kind: 'student' | 'staff'; email: string | null; department: string };
type ClassRow = { id: string; owner_id: string; name: string; code: string; created_at: string };

function view(db: DB, c: ClassRow, forOwner: boolean): Classroom {
  const teacher = person(db, db.prepare(`${USER} WHERE u.id = ?`).get(c.owner_id) as UserRow);
  const rows = db
    .prepare(`SELECT m.invited_at, m.joined_at, u.id, u.name, u.title, u.kind, u.email, d.name AS department
                FROM classroom_members m JOIN users u ON u.id = m.user_id JOIN departments d ON d.id = u.department_id
               WHERE m.classroom_id = ? ORDER BY m.joined_at IS NULL, u.name`)
    .all(c.id) as (UserRow & { invited_at: string; joined_at: string | null })[];
  return {
    id: c.id,
    name: c.name,
    code: forOwner ? c.code : null,
    createdAt: c.created_at,
    teacher,
    members: forOwner ? rows.map((m) => ({ person: person(db, m), email: m.email, invitedAt: m.invited_at, joinedAt: m.joined_at })) : [],
    joinedCount: rows.filter((m) => m.joined_at).length,
  };
}

const owned = (db: DB, id: string, userId: string) => {
  const c = db.prepare('SELECT * FROM classrooms WHERE id = ?').get(id) as ClassRow | undefined;
  if (!c || c.owner_id !== userId) throw new HttpError(404, 'Class not found');
  return c;
};

/**
 * Classrooms: a teacher creates a class (with a join code) and invites students by their registered email. The code
 * goes to that address; only an invited student can join with it. Joining also connects the student to the teacher.
 */
export function classroomRoutes(db: DB, wrap: Wrap) {
  const r = Router();
  const staff = requireRole(...APPROVER_ROLES, 'admin');

  r.get('/classrooms', requireAuth, (req, res) => {
    const me = req.user!.sub;
    const mine = db.prepare('SELECT * FROM classrooms WHERE owner_id = ? ORDER BY created_at DESC').all(me) as ClassRow[];
    const joined = db
      .prepare('SELECT c.* FROM classrooms c JOIN classroom_members m ON m.classroom_id = c.id WHERE m.user_id = ? AND m.joined_at IS NOT NULL ORDER BY m.joined_at DESC')
      .all(me) as ClassRow[];
    res.json([...mine.map((c) => view(db, c, true)), ...joined.map((c) => view(db, c, false))]);
  });

  r.post('/classrooms', requireAuth, staff, wrap((req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
    if (!name) throw new HttpError(400, 'Name the class');
    const c: ClassRow = { id: randomUUID(), owner_id: req.user!.sub, name, code: newCode(db), created_at: new Date().toISOString() };
    db.prepare('INSERT INTO classrooms (id, owner_id, name, code, created_at) VALUES (@id, @owner_id, @name, @code, @created_at)').run(c);
    res.status(201).json(view(db, c, true));
  }));

  r.delete('/classrooms/:id', requireAuth, staff, wrap((req, res) => {
    const c = owned(db, req.params.id, req.user!.sub);
    db.transaction(() => {
      db.prepare('DELETE FROM classroom_members WHERE classroom_id = ?').run(c.id);
      db.prepare('DELETE FROM classrooms WHERE id = ?').run(c.id);
    })();
    res.json({ ok: true });
  }));

  // Invite by registered email: each address must belong to a student account. The code is emailed to that address.
  r.post('/classrooms/:id/invite', requireAuth, staff, wrap((req, res) => {
    const c = owned(db, req.params.id, req.user!.sub);
    const list = Array.isArray(req.body?.emails) ? (req.body.emails as unknown[]) : [];
    const emails = [...new Set(list.filter((e): e is string => typeof e === 'string').map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (!emails.length) throw new HttpError(400, 'Add at least one student email');
    if (emails.length > MAX_INVITES) throw new HttpError(400, `At most ${MAX_INVITES} emails at a time`);
    const teacher = db.prepare('SELECT name FROM users WHERE id = ?').pluck().get(c.owner_id) as string;
    const results: InviteResult[] = db.transaction(() =>
      emails.map((email): InviteResult => {
        const u = db.prepare('SELECT id, kind FROM users WHERE lower(email) = ?').get(email) as { id: string; kind: string } | undefined;
        if (!u) return { email, ok: false, error: 'No account with this email. Ask the student to sign up first.' };
        if (u.kind !== 'student') return { email, ok: false, error: 'This is a staff account' };
        const m = db.prepare('SELECT joined_at FROM classroom_members WHERE classroom_id = ? AND user_id = ?').get(c.id, u.id) as { joined_at: string | null } | undefined;
        if (m?.joined_at) return { email, ok: false, error: 'Already in this class' };
        if (m) db.prepare('UPDATE classroom_members SET invited_at = ? WHERE classroom_id = ? AND user_id = ?').run(new Date().toISOString(), c.id, u.id);
        else db.prepare('INSERT INTO classroom_members (classroom_id, user_id, invited_at) VALUES (?, ?, ?)').run(c.id, u.id, new Date().toISOString());
        notify(
          db,
          u.id,
          'classroom_invite',
          `Join ${c.name} on CampusSign: code ${c.code}`,
          `${teacher} invited you to the class "${c.name}".\n\nYour join code: ${c.code}\n\nOpen your dashboard and enter the code under "Join a class". The code only works for the account registered with this email.\n\n${link('/student')}`,
        );
        return { email, ok: true };
      }),
    )();
    res.json({ results, classroom: view(db, c, true) });
  }));

  r.delete('/classrooms/:id/members/:userId', requireAuth, staff, wrap((req, res) => {
    const c = owned(db, req.params.id, req.user!.sub);
    db.prepare('DELETE FROM classroom_members WHERE classroom_id = ? AND user_id = ?').run(c.id, req.params.userId);
    res.json(view(db, c, true));
  }));

  // Join with the emailed code. Only works for the student it was sent to.
  r.post('/classrooms/join', requireAuth, requireRole('student'), wrap((req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    const c = db.prepare('SELECT * FROM classrooms WHERE code = ?').get(code) as ClassRow | undefined;
    if (!c) throw new HttpError(404, 'No class with this code');
    const me = req.user!.sub;
    const m = db.prepare('SELECT joined_at FROM classroom_members WHERE classroom_id = ? AND user_id = ?').get(c.id, me) as { joined_at: string | null } | undefined;
    if (!m) throw new HttpError(403, 'This code was sent to a different email. Ask your teacher to invite the email you signed up with.');
    if (m.joined_at) throw new HttpError(409, 'You are already in this class');
    const t = new Date().toISOString();
    db.transaction(() => {
      db.prepare('UPDATE classroom_members SET joined_at = ? WHERE classroom_id = ? AND user_id = ?').run(t, c.id, me);
      // Joining a class makes the teacher "your teacher": their requests route to them first.
      db.prepare(
        `INSERT INTO connections (student_id, staff_id, status, created_at, responded_at) VALUES (?, ?, 'accepted', ?, ?)
         ON CONFLICT (student_id, staff_id) DO UPDATE SET status = 'accepted', responded_at = excluded.responded_at`,
      ).run(me, c.owner_id, t, t);
    })();
    res.json(view(db, c, false));
  }));

  return r;
}
