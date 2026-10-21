import bcrypt from 'bcryptjs';
import type { Role } from '@plc/shared';
import type { DB } from './db.js';

export const DEMO_PIN = '1234';

export const PEOPLE: { id: string; name: string; title: string; role: Role }[] = [
  { id: 'u_riya', name: 'Riya', title: 'CSE, 2nd year', role: 'student' },
  { id: 'u_mehta', name: 'Prof. Mehta', title: 'Faculty coordinator, CSE', role: 'faculty_coordinator' },
  { id: 'u_kulkarni', name: 'Prof. Kulkarni', title: 'HoD, CSE', role: 'hod' },
  { id: 'u_rao', name: 'Dr. Rao', title: 'Dean Student Affairs', role: 'dean_sa' },
  { id: 'u_pawar', name: 'Mr. Pawar', title: 'Security', role: 'security' },
  { id: 'u_admin', name: 'Admin', title: 'Registrar office', role: 'admin' },
];

/** Reset people and roles to the demo set. Safe to run repeatedly. */
export function seed(db: DB) {
  const pinHash = bcrypt.hashSync(DEMO_PIN, 8);
  db.transaction(() => {
    db.exec('DELETE FROM user_roles; DELETE FROM users; DELETE FROM departments;');
    db.prepare('INSERT INTO departments (id, name) VALUES (?, ?)').run('cse', 'Computer Science and Engineering');
    const user = db.prepare('INSERT INTO users (id, name, title, department_id, pin_hash) VALUES (?, ?, ?, ?, ?)');
    const role = db.prepare('INSERT INTO user_roles (user_id, role, department_id) VALUES (?, ?, ?)');
    for (const p of PEOPLE) {
      user.run(p.id, p.name, p.title, 'cse', pinHash);
      role.run(p.id, p.role, 'cse');
    }
  })();
}

if (process.argv[1]?.endsWith('seed.ts')) {
  const { config } = await import('./config.js');
  const { openDb } = await import('./db.js');
  seed(openDb(config.dbPath));
  console.log(`Seeded ${PEOPLE.length} profiles into ${config.dbPath} (PIN ${DEMO_PIN})`);
}
