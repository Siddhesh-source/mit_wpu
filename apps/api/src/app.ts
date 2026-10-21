import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { ROLES, type Me, type Profile, type Role } from '@plc/shared';
import type { DB } from './db.js';
import { requireAuth, signToken } from './auth.js';
import { errorHandler, workflowRoutes } from './routes.js';
import { rateLimit } from './ratelimit.js';
import { configureLinks } from './notify.js';
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


export function createApp(db: DB, services: Partial<Services> = {}) {
  const svc: Services = {
    chain: null,
    storageDir: config.storageDir,
    publicBaseUrl: config.publicBaseUrl,
    collegeId: config.collegeId,
    maxUploadMb: config.maxUploadMb,
    slaMinutes: config.slaMinutes,
    ...services,
  };
  configureLinks({ publicBaseUrl: svc.publicBaseUrl });
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1); // behind Caddy/nginx: real client IP for rate limits
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
  });
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  const rolesOf = (userId: string) =>
    (db.prepare('SELECT DISTINCT role FROM user_roles WHERE user_id = ?').pluck().all(userId) as Role[]).sort(
      (a, b) => ROLES.indexOf(a) - ROLES.indexOf(b),
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

  const pinLimit = rateLimit({ max: svc.pinRateLimit ?? 20, windowMs: 60_000 });
  app.post('/api/auth/login', pinLimit, (req, res) => {
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

  app.use(['/api/approvals', '/api/requests/:id/revoke'], (req, res, next) => (req.method === 'POST' ? pinLimit(req, res, next) : next()));
  app.use('/api', workflowRoutes(db, svc));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Built web app (npm run build): one port for everything in production.
  if (fs.existsSync(path.join(config.webDist, 'index.html'))) {
    app.use(
      express.static(config.webDist, {
        index: false,
        setHeaders: (res, file) =>
          res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache'),
      }),
    );
    app.get('*', (_req, res) => res.setHeader('Cache-Control', 'no-cache').sendFile(path.join(config.webDist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
