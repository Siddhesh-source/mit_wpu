import { Router, type NextFunction, type Request, type Response } from 'express';
import type { DB } from './db.js';
import { requireAuth, requireRole } from './auth.js';
import { HttpError } from './errors.js';
import { canView, decide, getDetail, inbox, listMine, listTypes, resubmitRequest, submitRequest } from './workflow.js';
import { issuerKey } from './keys.js';

type Handler = (req: Request, res: Response) => unknown;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

export function workflowRoutes(db: DB) {
  const r = Router();

  r.get('/request-types', (_req, res) => res.json(listTypes(db)));
  r.get('/issuer-public-key', wrap(async (_req, res) => res.json({ publicKey: (await issuerKey(db)).publicKey })));

  r.post('/requests', requireAuth, requireRole('student'), wrap((req, res) => {
    const id = submitRequest(db, req.user!.sub, req.body?.type, req.body?.form);
    res.status(201).json(getDetail(db, id));
  }));

  r.get('/requests/mine', requireAuth, requireRole('student'), (req, res) => res.json(listMine(db, req.user!.sub)));

  r.get('/requests/:id', requireAuth, wrap((req, res) => {
    if (!canView(db, req.user!.sub, req.user!.roles, req.params.id)) throw new HttpError(403, 'Not your request');
    res.json(getDetail(db, req.params.id));
  }));

  r.post('/requests/:id/resubmit', requireAuth, requireRole('student'), wrap((req, res) => {
    resubmitRequest(db, req.user!.sub, req.params.id, req.body?.form);
    res.json(getDetail(db, req.params.id));
  }));

  r.get('/inbox', requireAuth, requireRole('faculty_coordinator', 'hod', 'dean_sa', 'security'), (req, res) => res.json(inbox(db, req.user!.sub)));

  r.post('/approvals/:id/decide', requireAuth, wrap(async (req, res) => {
    await decide(db, req.user!.sub, Number(req.params.id), req.body?.decision, req.body?.comment, req.body?.pin);
    res.json({ ok: true });
  }));

  return r;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}
