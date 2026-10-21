import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { sha256Hex } from '@plc/shared';
import { setup } from './helpers.js';

const FF180 = {
  academicYear: '2025-26',
  semester: 'I',
  groupNo: 'TY-AIDS-B-G15',
  projectTitle: 'Agentic Observability and Automated Bug Resolution System',
  projectArea: 'Agentic AI',
  members: 'SY AIDS-B, 68, 12415169, Riya, 9000000000, riya@campus.example',
  guideName: 'Prof. Dr. Minal Barhate',
};
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const pdfBytes = (res: any) =>
  res.buffer(true).parse((r: any, cb: any) => {
    const c: Buffer[] = [];
    r.on('data', (d: Buffer) => c.push(d));
    r.on('end', () => cb(null, Buffer.concat(c)));
  });

async function ready() {
  const ctx = await setup();
  await ctx.login('u_barhate');
  await ctx.login('u_dongre');
  return ctx;
}

/** Generate FF 180 for Riya and send it to the guide and the HoD with the template's own sign spots. */
async function sendFF180(ctx: Awaited<ReturnType<typeof ready>>) {
  const gen = await ctx.as('u_riya').post('/api/templates/ff180', { values: FF180 });
  expect(gen.status).toBe(201);
  const signers = [
    { userId: 'u_barhate', label: 'Guide' },
    { userId: 'u_dongre', label: 'Head of Department' },
  ];
  const fields = gen.body.spots
    .map((s: any) => ({ ...s, step: signers.findIndex((x) => x.label === s.label) + 1 }))
    .filter((f: any) => f.step > 0);
  const res = await ctx.as('u_riya').post('/api/requests', {
    type: 'sign_document',
    form: { title: 'FF 180 Project Registration, TY-AIDS-B-G15' },
    attachments: [gen.body.document.id],
    signers,
    fields,
  });
  return { gen, res, fields };
}

describe('sign in place', () => {
  it('stores my signature (PNG only) and returns it', async () => {
    const ctx = await ready();
    expect((await ctx.as('u_mehta').get('/api/me/signature')).body).toEqual({ dataUrl: null });
    expect((await ctx.as('u_mehta').post('/api/me/signature', {})).status).toBe(404); // PUT only
    const bad = await ctx.as('u_mehta').get('/api/me/signature');
    expect(bad.status).toBe(200);
    const request = (await import('supertest')).default;
    const tok = (await request(ctx.app).post('/api/auth/login').send({ userId: 'u_mehta', pin: '1234' })).body.token;
    expect((await request(ctx.app).put('/api/me/signature').set('Authorization', `Bearer ${tok}`).send({ dataUrl: 'data:image/jpeg;base64,AAAA' })).status).toBe(400);
    const ok = await request(ctx.app).put('/api/me/signature').set('Authorization', `Bearer ${tok}`).send({ dataUrl: PNG_1x1, kind: 'drawn' });
    expect(ok.status).toBe(200);
    expect((await ctx.as('u_mehta').get('/api/me/signature')).body).toMatchObject({ dataUrl: PNG_1x1, kind: 'drawn' });
    // the AIDS guide and HoD come with stored signatures
    expect((await ctx.as('u_barhate').get('/api/me/signature')).body.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('FF 180: guide then HoD sign in their boxes; the signed copy is the form plus a certificate and verifies', async () => {
    const ctx = await ready();
    const { gen, res, fields } = await sendFF180(ctx);
    expect(res.status).toBe(201);
    expect(fields).toHaveLength(2); // Guide + Head of Department (no Project Coordinator in this request)
    expect(res.body.signing).toMatchObject({
      fields: [expect.objectContaining({ step: 1, page: 1 }), expect.objectContaining({ step: 2, page: 1 })],
      signers: [
        { step: 1, label: 'Guide', name: 'Prof. Dr. Minal Barhate', userId: 'u_barhate', signed: false },
        { step: 2, label: 'Head of Department', name: 'Dr. Shital Parag Dongre', userId: 'u_dongre', signed: false },
      ],
    });
    expect(res.body.timeline.map((s: any) => [s.roleLabel, s.assignee.id, s.decision])).toEqual([
      ['Guide', 'u_barhate', 'pending'],
      ['Head of Department', 'u_dongre', 'waiting'],
    ]);
    const id = res.body.id;

    await ctx.act('u_barhate', id, 'approved');
    // the guide's captured signature is now visible in her box
    const sig = await ctx.as('u_riya').get(`/api/requests/${id}/signatures/1`);
    expect(sig.status).toBe(200);
    expect(sig.headers['content-type']).toMatch(/png/);
    expect((await ctx.as('u_riya').get(`/api/requests/${id}/signatures/2`)).status).toBe(404);

    await ctx.act('u_dongre', id, 'approved');
    const done = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body;
    expect(done.status).toBe('sealed');
    expect(done.signing.signers.every((s: any) => s.signed)).toBe(true);

    const pdf = (await pdfBytes(ctx.as('u_riya').get(`/api/requests/${id}/pdf`))).body as Buffer;
    if (process.env.SIGNED_PDF_OUT) (await import('node:fs')).writeFileSync(process.env.SIGNED_PDF_OUT, pdf); // to look at the result
    const doc = await PDFDocument.load(pdf);
    const original = await PDFDocument.load(new Uint8Array((await pdfBytes(ctx.as('u_riya').get(`/api/attachments/${res.body.signing.attachmentId}`))).body));
    expect(doc.getPageCount()).toBe(original.getPageCount() + 1); // the form, page for page, plus the certificate
    expect(gen.body.document.name).toMatch(/FF No. 180/);
    // the signed copy is what is on chain
    const v = await ctx.pub(`/api/verify/hash/${sha256Hex(pdf)}`);
    expect(v.body.status).toBe('verified');
  });

  it('a signer with boxes needs a saved signature; the one captured at signing is kept', async () => {
    const ctx = await ready();
    const { res } = await sendFF180(ctx);
    const request = (await import('supertest')).default;
    const tok = (await request(ctx.app).post('/api/auth/login').send({ userId: 'u_barhate', pin: '1234' })).body.token;
    await request(ctx.app).delete('/api/me/signature').set('Authorization', `Bearer ${tok}`);
    const blocked = await ctx.act('u_barhate', res.body.id, 'approved');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/signature/);
    // returning does not need a signature
    expect((await ctx.act('u_barhate', res.body.id, 'returned')).status).toBe(200);

    await request(ctx.app).put('/api/me/signature').set('Authorization', `Bearer ${tok}`).send({ dataUrl: PNG_1x1 });
    await ctx.as('u_riya').post(`/api/requests/${res.body.id}/resubmit`, { form: { title: 'FF 180 Project Registration, TY-AIDS-B-G15 (corrected)' } });
    expect((await ctx.act('u_barhate', res.body.id, 'approved')).status).toBe(200);
    const kept = ctx.db.prepare("SELECT s.png FROM approval_signatures s JOIN approvals a ON a.id = s.approval_id WHERE a.request_id = ? AND a.decision = 'approved'").pluck().get(res.body.id) as Buffer;
    expect(kept.toString('base64')).toBe(PNG_1x1.split(',')[1]);
  });

  it('validates signers and boxes', async () => {
    const ctx = await ready();
    const gen = await ctx.as('u_riya').post('/api/templates/ff180', { values: FF180 });
    const send = (body: object) => ctx.as('u_riya').post('/api/requests', { type: 'sign_document', form: { title: 'x' }, attachments: [gen.body.document.id], ...body });
    expect((await send({})).status).toBe(400);
    expect((await send({ signers: [{ userId: 'u_riya' }] })).status).toBe(400);
    expect((await send({ signers: [{ userId: 'u_barhate' }, { userId: 'u_joshi' }] })).body.error).toMatch(/both Faculty/);
    expect((await send({ signers: [{ userId: 'u_barhate' }], fields: [{ step: 2, page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.05 }] })).status).toBe(400);
    expect((await send({ signers: [{ userId: 'u_barhate' }], fields: [{ step: 1, page: 1, x: 0.9, y: 0.1, w: 2, h: 0.05 }] })).status).toBe(400);
    expect((await ctx.as('u_riya').post('/api/templates/ff180', { values: {} })).status).toBe(400);
    expect((await ctx.as('u_riya').get('/api/templates')).body.map((t: any) => t.code)).toEqual(['ff180', 'leave', 'noc', 'iv']);
  });
});
