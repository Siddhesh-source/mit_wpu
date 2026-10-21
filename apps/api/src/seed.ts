import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Role } from '@plc/shared';
import type { DB } from './db.js';
import { CATALOG } from './catalog.js';

export const DEMO_PIN = '1234';
export const DEMO_PASSWORD = 'demo1234';
export const DEPARTMENTS = [
  ['cse', 'Computer Science and Engineering'],
  ['it', 'Information Technology'],
  ['entc', 'Electronics and Telecommunication'],
  ['mech', 'Mechanical Engineering'],
  ['civil', 'Civil Engineering'],
  ['mgmt', 'Management Studies'],
  ['aids', 'Artificial Intelligence and Data Science'],
] as const;

/** AIDS department: the project guide and the Head of Department, each with a stored signature (assets/signatures). */
export const SIGNING_PEOPLE: { id: string; name: string; title: string; role: Role; email: string; dept: string }[] = [
  { id: 'u_barhate', name: 'Prof. Dr. Minal Barhate', title: 'Professor, AIDS (project guide)', role: 'faculty', email: 'minal.barhate@campus.example', dept: 'aids' },
  { id: 'u_dongre', name: 'Dr. Shital Parag Dongre', title: 'Head of Department, AIDS', role: 'hod', email: 'shital.dongre@campus.example', dept: 'aids' },
];
const SIGNATURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'signatures');

export const PEOPLE: { id: string; name: string; title: string; role: Role; email: string }[] = [
  { id: 'u_riya', name: 'Riya', title: 'CSE, 2nd year', role: 'student', email: 'riya@campus.example' },
  { id: 'u_mehta', name: 'Prof. Mehta', title: 'Faculty coordinator, CSE', role: 'faculty_coordinator', email: 'mehta@campus.example' },
  { id: 'u_kulkarni', name: 'Prof. Kulkarni', title: 'HoD, CSE', role: 'hod', email: 'kulkarni@campus.example' },
  { id: 'u_rao', name: 'Dr. Rao', title: 'Dean Student Affairs', role: 'dean_sa', email: 'rao@campus.example' },
  { id: 'u_pawar', name: 'Mr. Pawar', title: 'Security', role: 'security', email: 'security@campus.example' },
  { id: 'u_admin', name: 'Admin', title: 'Registrar office', role: 'admin', email: 'registrar@campus.example' },
  { id: 'u_joshi', name: 'Prof. Joshi', title: 'Associate Professor, CSE', role: 'faculty', email: 'joshi@campus.example' },
  { id: 'u_iyer', name: 'Ms. Iyer', title: 'Librarian', role: 'librarian', email: 'library@campus.example' },
  { id: 'u_shaikh', name: 'Mr. Shaikh', title: 'Lab in-charge, CSE', role: 'lab_incharge', email: 'labs@campus.example' },
  { id: 'u_patil', name: 'Mr. Patil', title: 'Hostel warden', role: 'warden', email: 'hostel@campus.example' },
  { id: 'u_desai', name: 'Mrs. Desai', title: 'Accounts office', role: 'accounts', email: 'accounts@campus.example' },
];

/** Reset everything to the demo set: people, roles, catalogue, no requests. Keeps the issuer key. */
export function seed(db: DB) {
  const pinHash = bcrypt.hashSync(DEMO_PIN, 8);
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 8);
  const t = new Date(Date.now() - 86400_000).toISOString(); // demo people joined "yesterday": live sign-ups are newer
  db.transaction(() => {
    db.exec(`DELETE FROM approval_signatures; DELETE FROM sign_fields; DELETE FROM user_signatures; DELETE FROM classroom_members; DELETE FROM classrooms; DELETE FROM request_routes; DELETE FROM connections; DELETE FROM comments; DELETE FROM outbox; DELETE FROM delegations; DELETE FROM attachments; DELETE FROM revocations; DELETE FROM seals; DELETE FROM audit_log; DELETE FROM approvals; DELETE FROM request_versions; DELETE FROM requests;
             DELETE FROM route_steps; DELETE FROM request_types;
             DELETE FROM user_roles; DELETE FROM users; DELETE FROM departments;`);
    for (const [id, name] of DEPARTMENTS) db.prepare('INSERT INTO departments (id, name) VALUES (?, ?)').run(id, name);
    const user = db.prepare(
      'INSERT INTO users (id, name, title, department_id, pin_hash, email, password_hash, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const role = db.prepare('INSERT INTO user_roles (user_id, role, department_id) VALUES (?, ?, ?)');
    for (const p of PEOPLE) {
      user.run(p.id, p.name, p.title, 'cse', pinHash, p.email, passwordHash, p.role === 'student' ? 'student' : 'staff', t);
      role.run(p.id, p.role, 'cse');
    }
    const type = db.prepare('INSERT INTO request_types (code, name, fields_json) VALUES (?, ?, ?)');
    const step = db.prepare('INSERT INTO route_steps (request_type, step_no, role, affected_by_json, sla_hours) VALUES (?, ?, ?, ?, ?)');
    for (const t of CATALOG) {
      type.run(t.code, t.name, JSON.stringify(t.fields));
      for (const s of t.steps) step.run(t.code, s.stepNo, s.role, JSON.stringify(s.affectedBy), s.slaHours ?? 48);
    }
  })();
  syncDemoPeople(db);
}

/** Add the AIDS department and its people (with their signatures) when missing. Keeps all data; runs on start. */
export function syncDemoPeople(db: DB) {
  const t = new Date(Date.now() - 86400_000).toISOString();
  db.transaction(() => {
    for (const [id, name] of DEPARTMENTS) db.prepare('INSERT OR IGNORE INTO departments (id, name) VALUES (?, ?)').run(id, name);
    for (const p of SIGNING_PEOPLE) {
      if (db.prepare('SELECT 1 FROM users WHERE id = ? OR lower(email) = ?').get(p.id, p.email)) continue;
      db.prepare(
        "INSERT INTO users (id, name, title, department_id, pin_hash, email, password_hash, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'staff', ?)",
      ).run(p.id, p.name, p.title, p.dept, bcrypt.hashSync(DEMO_PIN, 8), p.email, bcrypt.hashSync(DEMO_PASSWORD, 8), t);
      db.prepare('INSERT INTO user_roles (user_id, role, department_id) VALUES (?, ?, ?)').run(p.id, p.role, p.dept);
      const png = path.join(SIGNATURES, `${p.id}.png`);
      if (fs.existsSync(png))
        db.prepare("INSERT OR REPLACE INTO user_signatures (user_id, png, kind, updated_at) VALUES (?, ?, 'uploaded', ?)").run(p.id, fs.readFileSync(png), t);
    }
  })();
}

/** Add request types that are new in the catalogue to an existing database, keeping all data. Runs on start. */
export function syncCatalog(db: DB) {
  const type = db.prepare('INSERT OR IGNORE INTO request_types (code, name, fields_json) VALUES (?, ?, ?)');
  const step = db.prepare('INSERT OR IGNORE INTO route_steps (request_type, step_no, role, affected_by_json, sla_hours) VALUES (?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (const t of CATALOG) {
      type.run(t.code, t.name, JSON.stringify(t.fields));
      for (const s of t.steps) step.run(t.code, s.stepNo, s.role, JSON.stringify(s.affectedBy), s.slaHours ?? 48);
    }
  })();
}

if (process.argv[1]?.endsWith('seed.ts')) {
  const { config } = await import('./config.js');
  const { openDb } = await import('./db.js');
  seed(openDb(config.dbPath));
  console.log(`Seeded ${PEOPLE.length} demo accounts into ${config.dbPath} (password ${DEMO_PASSWORD}, PIN ${DEMO_PIN})`);
}
