import bcrypt from 'bcryptjs';
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
] as const;

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
    db.exec(`DELETE FROM connections; DELETE FROM comments; DELETE FROM outbox; DELETE FROM delegations; DELETE FROM attachments; DELETE FROM revocations; DELETE FROM seals; DELETE FROM audit_log; DELETE FROM approvals; DELETE FROM request_versions; DELETE FROM requests;
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
}

if (process.argv[1]?.endsWith('seed.ts')) {
  const { config } = await import('./config.js');
  const { openDb } = await import('./db.js');
  seed(openDb(config.dbPath));
  console.log(`Seeded ${PEOPLE.length} demo accounts into ${config.dbPath} (password ${DEMO_PASSWORD}, PIN ${DEMO_PIN})`);
}
