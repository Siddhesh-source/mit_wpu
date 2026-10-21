import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import type { Me, Profile, Role } from '@plc/shared';
import type { DB } from './db.js';
import { requireAuth, signToken } from './auth.js';
import { errorHandler, workflowRoutes } from './routes.js';
import type { Services } from './seal.js';
import { config } from './config.js';

const initials = (name: string) =>
  name
    .replace(/^(Prof|Dr|Mr|Ms|Mrs)\.\s*/, '')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const ROLE_ORDER: Role[] = ['student', 'faculty_coordinator', 'hod', 'dean_sa', 'security', 'admin'];

export function createApp(db: DB, services: Partial<Services> = {}) {
  const svc: Services = { chain: null, storageDir: config.storageDir, publicBaseUrl: config.publicBaseUrl, ...services };
  const app = express();
  app.use(cors());
  app.use(express.json());

  const rolesOf = (userId: string) =>
    (db.prepare('SELECT DISTINCT role FROM user_roles WHERE user_id = ?').pluck().all(userId) as Role[]).sort(
      (a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b),
    );

  app.get('/api/health', async (_req, res) => {
    const contract = await svc.chain?.address().catch(() => null);
    res.json({ ok: true, chain: svc.chain ? { network: svc.chain.network, contract: contract ?? 'unreachable' } : null });
  });

  app.get('/api/profiles', (_req, res) => {
    const users = db.prepare('SELECT id, name, title FROM users ORDER BY rowid').all() as Omit<Profile, 'role' | 'initials'>[];
    const profiles: Profile[] = users.map((u) => ({ ...u, role: rolesOf(u.id)[0], initials: initials(u.name) }));
    res.json(profiles);
  });

  app.post('/api/auth/login', (req, res) => {
    const { userId, pin } = req.body ?? {};
    const user = db.prepare('SELECT id, pin_hash FROM users WHERE id = ?').get(userId) as { id: string; pin_hash: string } | undefined;
    if (!user || typeof pin !== 'string' || !bcrypt.compareSync(pin, user.pin_hash))
      return res.status(401).json({ error: 'Wrong PIN' });
    const roles = rolesOf(user.id);
    res.json({ token: signToken({ sub: user.id, roles }), roles });
  });

  app.get('/api/me', requireAuth, (req, res) => {
    const u = db
      .prepare('SELECT u.id, u.name, u.title, d.name AS department FROM users u JOIN departments d ON d.id = u.department_id WHERE u.id = ?')
      .get(req.user!.sub) as Omit<Me, 'roles' | 'initials'> | undefined;
    if (!u) return res.status(404).json({ error: 'Profile not found' });
    const me: Me = { ...u, roles: rolesOf(u.id), initials: initials(u.name) };
    res.json(me);
  });

  app.use('/api', workflowRoutes(db, svc));
  app.use(errorHandler);
  return app;
}
