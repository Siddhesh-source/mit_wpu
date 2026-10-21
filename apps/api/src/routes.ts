import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { APPROVER_ROLES } from '@plc/shared';
import { ALLOWED, attachmentFor, saveUpload } from './attachments.js';
import { auditLog, batchApprove, colleagues, createDelegation, endDelegation, myDelegations, outbox, runSla, stats } from './ops.js';
import type { DB } from './db.js';
import { requireAuth, requireRole } from './auth.js';
import { HttpError } from './errors.js';
import { addComment, amendRequest, canView, decide, getDetail, inbox, listAll, listComments, listMine, listTypes, reopenRequest, resubmitRequest, submitRequest } from './workflow.js';
import { resetDemo } from './demo.js';
import { issuerKey } from './keys.js';
import { rateLimit } from './ratelimit.js';
import { history, pdfPath, revocationInfo, revocationList, revokeRequest, sealInfo, sealRequest, verifyHash, verifyRef, type Services } from './seal.js';

type Handler = (req: Request, res: Response) => unknown;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

export function workflowRoutes(db: DB, svc: Services) {
  const r = Router();
  const verifyLimit = rateLimit({ max: svc.verifyRateLimit ?? 60, windowMs: 60_000 });
  const detail = (id: string) => ({ ...getDetail(db, id), seal: sealInfo(db, svc, id), revocation: revocationInfo(db, id) });

  r.get('/request-types', (_req, res) => res.json(listTypes(db)));
  r.get('/issuer-public-key', wrap(async (_req, res) => res.json({ publicKey: (await issuerKey(db)).publicKey })));

  r.post('/requests', requireAuth, requireRole('student'), wrap((req, res) => {
    const id = submitRequest(db, req.user!.sub, req.body?.type, req.body?.form, req.body?.attachments);
    res.status(201).json(detail(id));
  }));

  r.get('/requests/mine', requireAuth, requireRole('student'), (req, res) => res.json(listMine(db, req.user!.sub)));

  r.get('/requests/:id', requireAuth, wrap((req, res) => {
    if (!canView(db, req.user!.sub, req.user!.roles, req.params.id)) throw new HttpError(403, 'Not your request');
    res.json(detail(req.params.id));
  }));

  r.get('/requests/:id/pdf', requireAuth, wrap((req, res) => {
    if (!canView(db, req.user!.sub, req.user!.roles, req.params.id)) throw new HttpError(403, 'Not your request');
    const file = pdfPath(db, req.params.id, req.query.v ? Number(req.query.v) : undefined);
    if (!file) throw new HttpError(404, 'No sealed PDF yet');
    res.download(file.pdf_path, `${req.params.id}-v${file.version}.pdf`);
  }));

  r.get('/verify/hash/:hash', verifyLimit, wrap(async (req, res) => res.json(await verifyHash(db, svc, req.params.hash))));
  r.get('/verify/ref/:rid/:v', verifyLimit, wrap(async (req, res) => res.json(await verifyRef(db, svc, req.params.rid, Number(req.params.v)))));

  r.post('/requests/:id/resubmit', requireAuth, requireRole('student'), wrap((req, res) => {
    resubmitRequest(db, req.user!.sub, req.params.id, req.body?.form, req.body?.attachments);
    res.json(detail(req.params.id));
  }));

  r.get('/requests/:id/history', requireAuth, wrap((req, res) => {
    if (!canView(db, req.user!.sub, req.user!.roles, req.params.id)) throw new HttpError(403, 'Not your request');
    res.json(history(db, svc, req.params.id));
  }));

  r.post('/requests/:id/revoke', requireAuth, requireRole('hod', 'dean_sa'), wrap(async (req, res) => {
    await revokeRequest(db, svc, req.user!.sub, req.params.id, req.body?.reason, req.body?.pin);
    res.json(detail(req.params.id));
  }));

  r.get('/revocations', verifyLimit, wrap(async (_req, res) => res.json(await revocationList(db))));

  r.post('/requests/:id/reopen', requireAuth, requireRole(...APPROVER_ROLES), wrap((req, res) => {
    reopenRequest(db, req.user!.sub, req.params.id, req.body?.reason, req.body?.pin);
    res.json(detail(req.params.id));
  }));
  r.get('/requests/:id/comments', requireAuth, wrap((req, res) => {
    if (!canView(db, req.user!.sub, req.user!.roles, req.params.id)) throw new HttpError(403, 'Not your request');
    res.json(listComments(db, req.params.id));
  }));
  r.post('/requests/:id/comments', requireAuth, wrap((req, res) => {
    if (!canView(db, req.user!.sub, req.user!.roles, req.params.id)) throw new HttpError(403, 'Not your request');
    addComment(db, req.user!.sub, req.params.id, req.body?.body);
    res.status(201).json(listComments(db, req.params.id));
  }));

  r.post('/requests/:id/amend', requireAuth, requireRole('student'), wrap((req, res) => {
    amendRequest(db, req.user!.sub, req.params.id, req.body?.changes, req.body?.reason, req.body?.attachments);
    res.json(detail(req.params.id));
  }));

  // Attachments: raw upload (Content-Type = file type, X-Filename = name), then pass the id with the request.
  r.post(
    '/attachments',
    requireAuth,
    requireRole('student'),
    express.raw({ type: Object.keys(ALLOWED), limit: `${svc.maxUploadMb ?? 5}mb` }),
    wrap((req, res) => res.status(201).json(saveUpload(db, svc.storageDir, req.user!.sub, req.headers['content-type'] ?? '', String(req.headers['x-filename'] ?? ''), req.body as Buffer))),
  );
  r.get('/attachments/:id', requireAuth, wrap((req, res) => {
    const a = attachmentFor(db, req.user!.sub, req.user!.roles, req.params.id);
    res.type(a.mime).download(a.path, a.name);
  }));

  // Approver tools: batch approve, delegation
  r.post('/approvals/batch', requireAuth, requireRole(...APPROVER_ROLES), wrap(async (req, res) => {
    const results = await batchApprove(db, req.user!.sub, req.body?.ids, req.body?.pin);
    for (const done of results.filter((x) => x.completed)) await sealRequest(db, svc, done.completed!);
    res.json(results);
  }));
  r.get('/delegations', requireAuth, requireRole(...APPROVER_ROLES), (req, res) => res.json({ mine: myDelegations(db, req.user!.sub), colleagues: colleagues(db, req.user!.sub) }));
  r.post('/delegations', requireAuth, requireRole(...APPROVER_ROLES), wrap((req, res) => res.status(201).json(createDelegation(db, req.user!.sub, req.body?.delegateId, req.body?.startsOn, req.body?.endsOn))));
  r.delete('/delegations/:id', requireAuth, requireRole(...APPROVER_ROLES), wrap((req, res) => (endDelegation(db, req.user!.sub, Number(req.params.id)), res.json({ ok: true }))));

  // Admin: overview, impact, audit, emails, deadline check
  r.get('/admin/stats', requireAuth, requireRole('admin'), (_req, res) => res.json(stats(db)));
  r.get('/admin/audit', requireAuth, requireRole('admin'), (req, res) => res.json(auditLog(db, Math.min(Number(req.query.limit) || 200, 1000), req.query.request ? String(req.query.request) : undefined)));
  r.get('/admin/emails', requireAuth, requireRole('admin'), (_req, res) => res.json(outbox(db)));
  r.post('/admin/run-sla', requireAuth, requireRole('admin'), (_req, res) => res.json(runSla(db, Date.now(), svc.slaMinutes ?? null)));
  r.get('/admin/requests', requireAuth, requireRole('admin'), (_req, res) => res.json(listAll(db)));
  r.post('/admin/reset-demo', requireAuth, requireRole('admin'), wrap(async (_req, res) => res.json({ id: await resetDemo(db, svc) })));

  r.get('/inbox', requireAuth, requireRole(...APPROVER_ROLES), (req, res) => res.json(inbox(db, req.user!.sub)));

  r.post('/approvals/:id/decide', requireAuth, wrap(async (req, res) => {
    const done = await decide(db, req.user!.sub, Number(req.params.id), req.body?.decision, req.body?.comment, req.body?.pin);
    if (done) {
      const requestId = db.prepare('SELECT request_id FROM approvals WHERE id = ?').pluck().get(Number(req.params.id)) as string;
      await sealRequest(db, svc, requestId);
    }
    res.json({ ok: true });
  }));

  return r;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}
