import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import type { DB } from './db.js';
import { accountRoutes } from './accounts.js';
import { errorHandler, workflowRoutes } from './routes.js';
import { rateLimit } from './ratelimit.js';
import { configureLinks } from './notify.js';
import type { Services } from './seal.js';
import { config } from './config.js';

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

  app.get('/api/health', async (_req, res) => {
    const contract = await svc.chain?.address().catch(() => null);
    res.json({ ok: true, chain: svc.chain ? { network: svc.chain.network, contract: contract ?? 'unreachable' } : null });
  });

  const pinLimit = rateLimit({ max: svc.pinRateLimit ?? 20, windowMs: 60_000 });
  const wrapA = (fn: (req: express.Request, res: express.Response) => unknown) => async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
  app.use('/api', accountRoutes(db, { wrap: wrapA, allowPinLogin: svc.allowPinLogin ?? config.allowPinLogin, limit: pinLimit }));
  app.use(['/api/approvals', '/api/requests/:id/revoke', '/api/requests/:id/reopen'], (req, res, next) => (req.method === 'POST' ? pinLimit(req, res, next) : next()));
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
