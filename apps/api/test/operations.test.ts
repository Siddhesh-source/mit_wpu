import { describe, it, expect, vi } from 'vitest';

// AWS SES is mocked: we check the exact request the SES mailer would send.
const sesCalls: any[] = [];
vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: class {
    constructor(public cfg: unknown) {}
    async send(cmd: any) {
      sesCalls.push({ cfg: this.cfg, input: cmd.input });
      return { MessageId: 'test' };
    }
  },
  SendEmailCommand: class {
    constructor(public input: unknown) {}
  },
}));
import request from 'supertest';
import { sha256Hex, verifyJson } from '@plc/shared';
import { setup, RIYA_EVENT } from './helpers.js';
import { runSla } from '../src/ops.js';
import { mailerFromConfig, processOutbox, type Mailer } from '../src/notify.js';

const PDF = Buffer.from('%PDF-1.4\n% venue booking\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

async function upload(ctx: any, user: string, body: Buffer, type = 'application/pdf', name = 'Hall booking.pdf') {
  const token = (await request(ctx.app).post('/api/auth/login').send({ userId: user, pin: '1234' })).body.token;
  return request(ctx.app).post('/api/attachments').set('Authorization', `Bearer ${token}`).set('Content-Type', type).set('X-Filename', encodeURIComponent(name)).send(body);
}
const emails = (db: any, kind?: string) =>
  db.prepare(`SELECT to_user, kind, subject FROM outbox ${kind ? 'WHERE kind = ?' : ''} ORDER BY id`).all(...(kind ? [kind] : [])) as { to_user: string; kind: string; subject: string }[];

describe('attachments', () => {
  it('upload → attach on submit → approvers sign over the file hash → listed on the sealed PDF', async () => {
    const ctx = await setup();
    const up = await upload(ctx, 'u_riya', PDF);
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ name: 'Hall booking.pdf', mime: 'application/pdf', size: PDF.length, sha256: sha256Hex(PDF) });
    const id = (await ctx.as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT, attachments: [up.body.id] })).body.id;

    const card = (await ctx.as('u_mehta').get('/api/inbox')).body[0];
    expect(card.attachments).toHaveLength(1);
    expect(card.attachments[0]).toMatchObject({ name: 'Hall booking.pdf', sha256: sha256Hex(PDF) });
    // approvers download the request's copy; the student's library item stays private
    expect((await ctx.as('u_mehta').get(`/api/attachments/${up.body.id}`)).status).toBe(403);
    const dl = await ctx.as('u_mehta').get(`/api/attachments/${card.attachments[0].id}`).buffer(true).parse((r: any, cb: any) => {
      const c: Buffer[] = [];
      r.on('data', (d: Buffer) => c.push(d));
      r.on('end', () => cb(null, Buffer.concat(c)));
    });
    expect(Buffer.compare(dl.body, PDF)).toBe(0);

    // The signed form hash covers the attachment
    const formHash = ctx.db.prepare('SELECT form_hash FROM request_versions WHERE request_id = ?').pluck().get(id);
    const { canonicalJson } = await import('@plc/shared');
    expect(formHash).toBe(sha256Hex(canonicalJson({ form: { ...RIYA_EVENT, purpose: RIYA_EVENT.purpose }, attachments: [sha256Hex(PDF)] })));

    for (const u of ['u_mehta', 'u_kulkarni', 'u_pawar', 'u_rao']) await ctx.act(u, id, 'approved');
    expect((await ctx.as('u_riya').get(`/api/requests/${id}`)).body.status).toBe('sealed');
  });

  it('rejects wrong types, fake content, other people, unknown ids and more than five; library files are reusable', async () => {
    const ctx = await setup();
    expect((await upload(ctx, 'u_riya', Buffer.from('hello'), 'text/plain', 'a.txt')).status).toBe(415);
    expect((await upload(ctx, 'u_riya', Buffer.from('not really a pdf'), 'application/pdf')).status).toBe(415);
    expect((await upload(ctx, 'u_kulkarni', PDF)).status).toBe(403); // only students upload
    const png = await upload(ctx, 'u_riya', PNG, 'image/png', 'poster.png');
    expect(png.status).toBe(201);
    const first = (await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' }, attachments: [png.body.id] })).body.id;
    expect(first).toBeTruthy();
    // library documents are reusable across requests; unknown ids are refused
    expect((await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa 2' }, attachments: [png.body.id] })).status).toBe(201);
    expect((await ctx.as('u_riya').get('/api/documents')).body.find((d: any) => d.id === png.body.id).usedIn).toBe(2);
    expect((await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa 3' }, attachments: ['nope'] })).status).toBe(400);
    const six = [];
    for (let i = 0; i < 6; i++) six.push((await upload(ctx, 'u_riya', PDF)).body.id);
    expect((await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Many' }, attachments: six })).body.error).toMatch(/At most 5/);
    // a stranger cannot download it
    expect((await ctx.as('u_pawar').get(`/api/attachments/${png.body.id}`)).status).toBe(403);
  });

  it('adding a file in an amendment goes back to the coordinator only', async () => {
    const ctx = await setup();
    const id = await ctx.approvedEvent();
    const up = await upload(ctx, 'u_riya', PDF, 'application/pdf', 'new booking.pdf');
    const d = (await ctx.as('u_riya').post(`/api/requests/${id}/amend`, { changes: {}, reason: 'Added the booking letter', attachments: [up.body.id] })).body;
    expect(d.status).toBe('amending');
    expect(d.timeline.filter((s: any) => s.decision === 'pending').map((s: any) => s.role)).toEqual(['faculty_coordinator']);
    expect(d.attachments.map((a: any) => a.name)).toEqual(['new booking.pdf']);
  });
});

describe('no-dues clearance (parallel)', () => {
  it('library, labs, hostel and accounts in parallel, then HoD', async () => {
    const ctx = await setup();
    const id = (await ctx.as('u_riya').post('/api/requests', { type: 'no_dues', form: { title: 'Final semester clearance' } })).body.id;
    let d = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.timeline.filter((s: any) => s.decision === 'pending').map((s: any) => s.role).sort()).toEqual(['accounts', 'lab_incharge', 'librarian', 'warden']);
    for (const u of ['u_iyer', 'u_shaikh', 'u_patil']) await ctx.login(u);
    await ctx.login('u_desai');
    await ctx.act('u_iyer', id, 'approved');
    await ctx.act('u_patil', id, 'approved');
    await ctx.act('u_desai', id, 'approved');
    expect((await ctx.as('u_kulkarni').get('/api/inbox')).body).toHaveLength(0); // waits for the labs
    await ctx.act('u_shaikh', id, 'approved');
    await ctx.act('u_kulkarni', id, 'approved');
    d = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.status).toBe('sealed');
    expect((await ctx.pub(`/api/verify/hash/${d.seal.docHash}`)).body.signers).toHaveLength(5);
  });
});

describe('delegation', () => {
  it('HoD away: pending and new approvals go to the delegate, who signs on behalf; ending it hands back', async () => {
    const ctx = await setup();
    await ctx.login('u_joshi');
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const a = (await ctx.as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;
    await ctx.act('u_mehta', a, 'approved'); // HoD now has it pending

    const del = await ctx.as('u_kulkarni').post('/api/delegations', { delegateId: 'u_joshi', startsOn: today, endsOn: today });
    expect(del.status).toBe(201);
    expect(del.body.moved).toBe(1);
    expect((await ctx.as('u_kulkarni').get('/api/inbox')).body).toHaveLength(0);
    const card = (await ctx.as('u_joshi').get('/api/inbox')).body[0];
    expect(card.myRole).toBe('hod');
    expect(emails(ctx.db, 'delegated').map((e) => e.to_user)).toEqual(['u_joshi']);

    // New requests route to the delegate too
    const b = (await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } })).body.id;
    const tl = (await ctx.as('u_riya').get(`/api/requests/${b}`)).body.timeline;
    expect(tl[0]).toMatchObject({ role: 'hod', assignee: { id: 'u_joshi' }, onBehalfOf: { id: 'u_kulkarni', name: 'Prof. Kulkarni' } });

    // Delegate signs on behalf; the signature records it
    await ctx.act('u_joshi', a, 'approved');
    const row = ctx.db.prepare("SELECT * FROM approvals WHERE request_id = ? AND role = 'hod'").get(a) as any;
    const { publicKey } = (await ctx.pub('/api/issuer-public-key')).body;
    const formHash = ctx.db.prepare('SELECT form_hash FROM request_versions WHERE request_id = ?').pluck().get(a);
    expect(await verifyJson({ requestId: a, version: 1, role: 'hod', approverId: 'u_joshi', onBehalfOf: 'u_kulkarni', decision: 'approved', formHash, signedAt: row.signed_at }, row.signature, publicKey)).toBe(true);
    // The original HoD can still see it
    expect((await ctx.as('u_kulkarni').get(`/api/requests/${a}`)).status).toBe(200);

    // Ending the delegation hands the open bonafide back to the HoD
    const { mine } = (await ctx.as('u_kulkarni').get('/api/delegations')).body;
    const { default: req } = await import('supertest');
    const token = (await req(ctx.app).post('/api/auth/login').send({ userId: 'u_kulkarni', pin: '1234' })).body.token;
    expect((await req(ctx.app).delete(`/api/delegations/${mine[0].id}`).set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await ctx.as('u_kulkarni').get('/api/inbox')).body.map((i: any) => i.id)).toEqual([b]);
  });

  it('refuses self, students, other departments, bad dates', async () => {
    const ctx = await setup();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const make = (body: object) => ctx.as('u_kulkarni').post('/api/delegations', body);
    expect((await make({ delegateId: 'u_kulkarni', startsOn: today, endsOn: today })).status).toBe(400);
    expect((await make({ delegateId: 'u_riya', startsOn: today, endsOn: today })).status).toBe(400);
    expect((await make({ delegateId: 'u_joshi', startsOn: today, endsOn: '2000-01-01' })).status).toBe(400);
    expect((await make({ delegateId: 'u_joshi', startsOn: 'soon', endsOn: today })).status).toBe(400);
    expect((await ctx.as('u_riya').post('/api/delegations', { delegateId: 'u_joshi', startsOn: today, endsOn: today })).status).toBe(403);
  });
});

describe('deadlines: nudge, then escalate', () => {
  it('nudges past the SLA and escalates to the next authority past twice the SLA, once each', async () => {
    const ctx = await setup();
    const id = (await ctx.as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;
    const opened = Date.parse(ctx.db.prepare("SELECT opened_at FROM approvals WHERE request_id = ? AND decision = 'pending'").pluck().get(id) as string);
    const H = 3600_000;
    expect(runSla(ctx.db, opened + 47 * H)).toEqual({ nudged: 0, escalated: 0 });
    expect(runSla(ctx.db, opened + 49 * H)).toEqual({ nudged: 1, escalated: 0 });
    expect(runSla(ctx.db, opened + 50 * H)).toEqual({ nudged: 0, escalated: 0 }); // once
    let tl = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body.timeline;
    expect(tl[0]).toMatchObject({ role: 'faculty_coordinator', overdue: true, escalated: false });
    expect(runSla(ctx.db, opened + 97 * H)).toEqual({ nudged: 0, escalated: 1 });
    tl = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body.timeline;
    expect(tl[0].escalated).toBe(true);
    expect(emails(ctx.db, 'sla_nudge').map((e) => e.to_user)).toEqual(['u_mehta']);
    expect(emails(ctx.db, 'sla_escalated').map((e) => e.to_user).sort()).toEqual(['u_kulkarni', 'u_mehta']); // HoD hears about the coordinator
    expect((await ctx.as('u_admin').get('/api/admin/stats')).body.overdue).toBe(1);
  });

  it('no-dues steps have a 24 h SLA; the demo override uses minutes', async () => {
    const ctx = await setup();
    const id = (await ctx.as('u_riya').post('/api/requests', { type: 'no_dues', form: { title: 'Clearance' } })).body.id;
    const opened = Date.parse(ctx.db.prepare("SELECT opened_at FROM approvals WHERE request_id = ? AND decision = 'pending' LIMIT 1").pluck().get(id) as string);
    expect(runSla(ctx.db, opened + 25 * 3600_000).nudged).toBe(4);
    const ctx2 = await setup();
    const id2 = (await ctx2.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } })).body.id;
    const opened2 = Date.parse(ctx2.db.prepare("SELECT opened_at FROM approvals WHERE request_id = ? AND decision = 'pending'").pluck().get(id2) as string);
    expect(runSla(ctx2.db, opened2 + 2 * 60_000 + 1000, 1)).toEqual({ nudged: 1, escalated: 1 });
  });
});

describe('batch approve', () => {
  it('approves several items with one PIN; each is signed on its own; completed ones are sealed', async () => {
    const ctx = await setup();
    const ids = [];
    for (const t of ['Visa', 'Scholarship', 'Passport']) ids.push((await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: t } })).body.id);
    const inbox = (await ctx.as('u_kulkarni').get('/api/inbox')).body;
    expect(inbox).toHaveLength(3);
    expect((await ctx.as('u_kulkarni').post('/api/approvals/batch', { ids: inbox.map((i: any) => i.approvalId), pin: '0000' })).status).toBe(401);
    const res = (await ctx.as('u_kulkarni').post('/api/approvals/batch', { ids: inbox.map((i: any) => i.approvalId), pin: '1234' })).body;
    expect(res.every((r: any) => r.ok)).toBe(true);
    expect(ctx.db.prepare("SELECT COUNT(DISTINCT signature) FROM approvals WHERE role = 'hod' AND decision = 'approved'").pluck().get()).toBe(3);
    const dean = (await ctx.as('u_rao').get('/api/inbox')).body;
    const done = (await ctx.as('u_rao').post('/api/approvals/batch', { ids: dean.map((i: any) => i.approvalId), pin: '1234' })).body;
    expect(done.filter((r: any) => r.completed)).toHaveLength(3);
    for (const id of ids) expect((await ctx.as('u_riya').get(`/api/requests/${id}`)).body.status).toBe('sealed');
    // someone else's items fail individually, not as a whole
    const r2 = (await ctx.as('u_rao').post('/api/approvals/batch', { ids: [inbox[0].approvalId], pin: '1234' })).body;
    expect(r2[0]).toMatchObject({ ok: false });
  });
});

describe('college id on chain', () => {
  it('every seal carries the issuing college id (chain, verify API and QR pass)', async () => {
    const ctx = await setup();
    const id = await ctx.approvedEvent();
    const hash = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body.seal.docHash;
    expect((await ctx.chain.get(hash)).issuer).toBe('COLLEGE-001');
    expect((await ctx.pub(`/api/verify/hash/${hash}`)).body.issuer).toBe('COLLEGE-001');
    const { decodePass } = await import('@plc/shared');
    const pass = ctx.db.prepare('SELECT pass FROM seals WHERE request_id = ?').pluck().get(id) as string;
    expect(decodePass(pass)!.payload.c).toBe('COLLEGE-001');
  });
});

describe('impact stats and audit log', () => {
  it('counts digitised approvals, sheets, CO2, per-role waits; admin only', async () => {
    const ctx = await setup();
    await ctx.approvedEvent();
    await ctx.approvedEvent({ ...RIYA_EVENT, title: 'Quiz night' });
    await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } });
    const s = (await ctx.as('u_admin').get('/api/admin/stats')).body;
    expect(s).toMatchObject({ requests: 3, digitised: 2, inReview: 1, sheetsSaved: 6, overdue: 0 });
    expect(s.co2Kg).toBeCloseTo(0.0762, 4);
    expect(s.byRole.find((r: any) => r.role === 'hod')).toMatchObject({ decided: 2, pending: 1 });
    expect(s.avgTurnaroundHours).toBeGreaterThanOrEqual(0);
    expect((await ctx.as('u_kulkarni').get('/api/admin/stats')).status).toBe(403);
  });

  it('audit log lists actions newest first, filterable by request', async () => {
    const ctx = await setup();
    const id = await ctx.approvedEvent();
    const all = (await ctx.as('u_admin').get('/api/admin/audit')).body;
    expect(all[0].action).toBe('anchored');
    const one = (await ctx.as('u_admin').get(`/api/admin/audit?request=${id}`)).body;
    expect(one.map((e: any) => e.action).reverse().slice(0, 2)).toEqual(['submitted', 'approved']);
    expect(one.find((e: any) => e.action === 'submitted').actor).toBe('Riya');
  });
});

describe('email notifications', () => {
  it('queues the right emails through the whole flow', async () => {
    const ctx = await setup();
    const id = (await ctx.as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;
    expect(emails(ctx.db).map((e) => `${e.kind}:${e.to_user}`)).toEqual(['approval_needed:u_mehta']);
    await ctx.act('u_mehta', id, 'approved');
    expect(emails(ctx.db, 'approval_needed').map((e) => e.to_user).slice(1).sort()).toEqual(['u_kulkarni', 'u_pawar']);
    await ctx.act('u_pawar', id, 'approved');
    await ctx.act('u_kulkarni', id, 'approved');
    await ctx.act('u_rao', id, 'approved');
    expect(emails(ctx.db, 'sealed')).toHaveLength(1);
    expect(emails(ctx.db, 'sealed')[0]).toMatchObject({ to_user: 'u_riya', subject: 'Approved and sealed: Robotics fest' });

    await ctx.as('u_riya').post(`/api/requests/${id}/amend`, { changes: { venue: 'Main Auditorium' }, reason: 'Moved' });
    expect(emails(ctx.db, 'amendment_needed').map((e) => e.to_user)).toEqual(['u_mehta']);
    await ctx.act('u_mehta', id, 'approved');
    expect(emails(ctx.db, 'amendment_needed').map((e) => e.to_user)).toEqual(['u_mehta', 'u_kulkarni']);
    await ctx.act('u_kulkarni', id, 'approved');
    expect(emails(ctx.db, 'sealed').map((e) => e.subject)).toContain('Approved and sealed: Robotics fest (v2)');

    await ctx.as('u_kulkarni').post(`/api/requests/${id}/revoke`, { reason: 'Cancelled', pin: '1234' });
    expect(emails(ctx.db, 'revoked').map((e) => e.to_user)).toEqual(['u_riya']);
    expect(emails(ctx.db, 'gate_revoked').map((e) => e.to_user)).toEqual(['u_pawar']);

    const b = (await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } })).body.id;
    await ctx.act('u_kulkarni', b, 'returned', { comment: 'Wrong purpose' });
    expect(emails(ctx.db, 'returned')[0]).toMatchObject({ to_user: 'u_riya', subject: 'Returned for changes: Visa' });
  });

  it('delivers through the mailer, retries failures and gives up after 5', async () => {
    const ctx = await setup();
    await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } });
    const sent: string[] = [];
    let fail = true;
    const flaky: Mailer = { name: 'ses', send: async (m) => { if (fail) throw new Error('throttled'); sent.push(m.to); } };
    await processOutbox(ctx.db, flaky);
    expect(ctx.db.prepare('SELECT status, attempts FROM outbox').get()).toEqual({ status: 'pending', attempts: 1 });
    fail = false;
    await processOutbox(ctx.db, flaky);
    expect(sent).toEqual(['kulkarni@campus.example']);
    expect(ctx.db.prepare('SELECT status FROM outbox').pluck().get()).toBe('sent');

    await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa 2' } });
    const broken: Mailer = { name: 'ses', send: async () => { throw new Error('denied'); } };
    for (let i = 0; i < 5; i++) await processOutbox(ctx.db, broken);
    expect(ctx.db.prepare("SELECT status FROM outbox ORDER BY id DESC LIMIT 1").pluck().get()).toBe('failed');

    // The log mailer marks them logged; admin can read the outbox
    await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa 3' } });
    await processOutbox(ctx.db, mailerFromConfig({ provider: 'log', from: 'x', sesRegion: 'ap-south-1', redirectAll: '', publicBaseUrl: '' }));
    const box = (await ctx.as('u_admin').get('/api/admin/emails')).body;
    expect(box[0]).toMatchObject({ status: 'logged', kind: 'approval_needed', to: 'kulkarni@campus.example' });
    expect(mailerFromConfig({ provider: 'off', from: 'x', sesRegion: 'x', redirectAll: '', publicBaseUrl: '' })).toBeNull();
  });

  it('the SES mailer sends a plain-text email from the configured sender, honouring the redirect address', async () => {
    const ses = mailerFromConfig({ provider: 'ses', from: 'PaperLess Campus <no-reply@college.example>', sesRegion: 'ap-south-1', redirectAll: 'demo-inbox@college.example', publicBaseUrl: '' })!;
    expect(ses.name).toBe('ses');
    await ses.send({ to: 'riya@campus.example', subject: 'Approved and sealed: Robotics fest', text: 'Hello' });
    expect(sesCalls).toHaveLength(1);
    expect(sesCalls[0].cfg).toEqual({ region: 'ap-south-1' });
    expect(sesCalls[0].input).toEqual({
      FromEmailAddress: 'PaperLess Campus <no-reply@college.example>',
      Destination: { ToAddresses: ['demo-inbox@college.example'] },
      Content: { Simple: { Subject: { Data: 'Approved and sealed: Robotics fest', Charset: 'UTF-8' }, Body: { Text: { Data: 'Hello', Charset: 'UTF-8' } } } },
    });
    const direct = mailerFromConfig({ provider: 'ses', from: 'a@b.c', sesRegion: 'ap-south-1', redirectAll: '', publicBaseUrl: '' })!;
    await direct.send({ to: 'riya@campus.example', subject: 's', text: 't' });
    expect(sesCalls[1].input.Destination.ToAddresses).toEqual(['riya@campus.example']);
  });
});
