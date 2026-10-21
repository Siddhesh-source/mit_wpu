import { describe, it, expect } from 'vitest';
import { verifyJson, verdictFor } from '@plc/shared';
import { setup } from './helpers.js';
import { processQueue } from '../src/seal.js';

const NEW_PLAN = { date: '2026-11-12', venue: 'Main Auditorium' };
const revoke = (ctx: any, user: string, id: string, extra: object = {}) =>
  ctx.as(user).post(`/api/requests/${id}/revoke`, { reason: 'Event cancelled by the college', pin: '1234', ...extra });

describe('revocation', () => {
  it('HoD revokes: request revoked, chain revoked, verify says Revoked', async () => {
    const ctx = await setup();
    const id = await ctx.approvedEvent();
    const hash = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body.seal.docHash;
    const res = await revoke(ctx, 'u_kulkarni', id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('revoked');
    expect(res.body.revocation).toMatchObject({ version: 1, role: 'hod', name: 'Prof. Kulkarni', reason: 'Event cancelled by the college', anchored: true });
    expect((await ctx.chain.get(hash)).status).toBe('revoked');
    expect((await ctx.chain.get(hash)).revokeReason).toBe(1);
    const v = (await ctx.pub(`/api/verify/hash/${hash}`)).body;
    expect(v.status).toBe('revoked');
    expect(v.revokedBy).toMatchObject({ role: 'hod', roleLabel: 'HoD' });
    expect(JSON.stringify(v)).not.toContain('Kulkarni');
    expect(JSON.stringify(v)).not.toContain('cancelled by the college'); // free-text reason stays private
  });

  it('Dean SA can revoke too (reason code 2)', async () => {
    const ctx = await setup();
    const id = await ctx.approvedEvent();
    const hash = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body.seal.docHash;
    expect((await revoke(ctx, 'u_rao', id)).status).toBe(200);
    expect((await ctx.chain.get(hash)).revokeReason).toBe(2);
  });

  it('coordinator, Security and the student cannot revoke; wrong PIN and missing reason are refused', async () => {
    const ctx = await setup();
    const id = await ctx.approvedEvent();
    expect((await revoke(ctx, 'u_mehta', id)).status).toBe(403);
    expect((await revoke(ctx, 'u_pawar', id)).status).toBe(403);
    expect((await revoke(ctx, 'u_riya', id)).status).toBe(403);
    expect((await revoke(ctx, 'u_kulkarni', id, { pin: '0000' })).status).toBe(401);
    expect((await revoke(ctx, 'u_kulkarni', id, { reason: '' })).status).toBe(400);
    expect((await ctx.as('u_riya').get(`/api/requests/${id}`)).body.status).toBe('sealed');
  });

  it('only sealed approvals can be revoked, once', async () => {
    const ctx = await setup();
    const inReview = (await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } })).body.id;
    expect((await revoke(ctx, 'u_kulkarni', inReview)).status).toBe(409);
    const id = await ctx.approvedEvent();
    expect((await revoke(ctx, 'u_kulkarni', id)).status).toBe(200);
    expect((await revoke(ctx, 'u_rao', id)).body.error).toBe('Already revoked');
    expect((await ctx.as('u_riya').post(`/api/requests/${id}/amend`, { changes: NEW_PLAN, reason: 'x' })).status).toBe(409);
  });

  it('after v2, revoking reports Revoked for v2 and for the old v1 too', async () => {
    const ctx = await setup();
    const id = await ctx.approvedEvent();
    const v1 = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body.seal.docHash;
    await ctx.as('u_riya').post(`/api/requests/${id}/amend`, { changes: NEW_PLAN, reason: 'x' });
    await ctx.act('u_mehta', id, 'approved');
    await ctx.act('u_kulkarni', id, 'approved');
    const v2 = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body.seal.docHash;
    expect((await ctx.pub(`/api/verify/hash/${v1}`)).body.status).toBe('superseded');

    await revoke(ctx, 'u_kulkarni', id);
    expect((await ctx.pub(`/api/verify/hash/${v2}`)).body.status).toBe('revoked');
    expect((await ctx.pub(`/api/verify/hash/${v1}`)).body.status).toBe('revoked'); // Revoked beats Superseded
    expect((await ctx.chain.get(v2)).status).toBe('revoked');
    const h = (await ctx.as('u_riya').get(`/api/requests/${id}/history`)).body;
    expect(h.map((v: any) => v.state)).toEqual(['revoked', 'revoked']);
  });

  it('revoking during an amendment cancels the amendment and revokes the sealed version', async () => {
    const ctx = await setup();
    const id = await ctx.approvedEvent();
    const v1 = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body.seal.docHash;
    await ctx.as('u_riya').post(`/api/requests/${id}/amend`, { changes: NEW_PLAN, reason: 'x' });
    expect((await revoke(ctx, 'u_rao', id)).status).toBe(200);
    const d = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.status).toBe('revoked');
    expect(d.version).toBe(1);
    expect((await ctx.as('u_mehta').get('/api/inbox')).body).toHaveLength(0);
    expect((await ctx.pub(`/api/verify/hash/${v1}`)).body.status).toBe('revoked');
  });

  it('with the chain down, verify says Revoked at once and the chain catches up on retry', async () => {
    const ctx = await setup();
    const id = await ctx.approvedEvent();
    const hash = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body.seal.docHash;
    const good = (await import('./helpers.js')).rpcUrl();
    ctx.chain.useRpc('http://127.0.0.1:9');
    expect((await revoke(ctx, 'u_kulkarni', id)).body.revocation.anchored).toBe(false);
    expect((await ctx.pub(`/api/verify/hash/${hash}`)).body.status).toBe('revoked'); // database answer, never "verified"
    ctx.chain.useRpc(good);
    await processQueue(ctx.db, ctx.svc);
    expect((await ctx.chain.get(hash)).status).toBe('revoked');
    expect((await ctx.as('u_riya').get(`/api/requests/${id}`)).body.revocation.anchored).toBe(true);
  });
});

describe('signed revocation list (for offline gates)', () => {
  it('lists revoked and superseded passes, signed by the issuer', async () => {
    const ctx = await setup();
    const a = await ctx.approvedEvent();
    await ctx.as('u_riya').post(`/api/requests/${a}/amend`, { changes: NEW_PLAN, reason: 'x' });
    await ctx.act('u_mehta', a, 'approved');
    await ctx.act('u_kulkarni', a, 'approved');
    const b = await ctx.approvedEvent({ title: 'Coding night', date: '2026-11-20', venue: 'Lab 3', headcount: 40 });
    await revoke(ctx, 'u_kulkarni', b);
    await ctx.approvedEvent({ title: 'Quiz', date: '2026-11-21', venue: 'Room 101', headcount: 30 }); // untouched: not listed

    const { list, signature } = (await ctx.pub('/api/revocations')).body;
    const { publicKey } = (await ctx.pub('/api/issuer-public-key')).body;
    expect(await verifyJson(list, signature, publicKey)).toBe(true);
    expect(await verifyJson({ ...list, entries: [] }, signature, publicKey)).toBe(false);
    expect(list.entries.map((e: any) => [e.rid, e.v, e.status])).toEqual([
      [b, 1, 'revoked'],
      [a, 1, 'superseded'],
    ]);
    expect(list.entries.every((e: any) => /^[0-9a-f]{64}$/.test(e.hash) && e.at)).toBe(true);
    expect(Date.now() - Date.parse(list.issuedAt)).toBeLessThan(10_000);
  });
});

describe('verdict precedence: Revoked > Superseded > outside validity > Verified', () => {
  const base = { revoked: false, superseded: false, validFrom: 100, validUntil: 200, now: 150 };
  it.each([
    [{}, 'verified'],
    [{ now: 50 }, 'not_yet_valid'],
    [{ now: 250 }, 'expired'],
    [{ now: 100 }, 'verified'],
    [{ now: 200 }, 'verified'],
    [{ superseded: true }, 'superseded'],
    [{ superseded: true, now: 250 }, 'superseded'],
    [{ revoked: true }, 'revoked'],
    [{ revoked: true, superseded: true }, 'revoked'],
    [{ revoked: true, superseded: true, now: 50 }, 'revoked'],
  ])('%j → %s', (over, want) => {
    expect(verdictFor({ ...base, ...over })).toBe(want);
  });
});
