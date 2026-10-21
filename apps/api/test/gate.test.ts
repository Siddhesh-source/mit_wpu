import { describe, it, expect } from 'vitest';
import { gateCheck, encodePass, type SignedRevocationList } from '@plc/shared';
import { setup } from './helpers.js';

const NEW_PLAN = { date: '2026-11-12', venue: 'Main Auditorium' };
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const EVENT_DAY = at('2026-11-05T09:30:00+05:30');

/** A list exactly as the gate device would have cached it, re-issued "at" a chosen time and re-signed. */
async function listAt(ctx: any, iso?: string): Promise<SignedRevocationList> {
  const body = (await ctx.pub('/api/revocations')).body as SignedRevocationList;
  if (!iso) return body;
  const { issuerKey } = await import('../src/keys.js');
  const { signJson } = await import('@plc/shared');
  const list = { ...body.list, issuedAt: iso };
  return { list, signature: await signJson(list, (await issuerKey(ctx.db)).privateKey) };
}

async function sealed(ctx: any) {
  const id = await ctx.approvedEvent();
  const pass = ctx.db.prepare('SELECT pass FROM seals WHERE request_id = ? AND version = 1').pluck().get(id) as string;
  const { publicKey } = (await ctx.pub('/api/issuer-public-key')).body;
  return { id, pass, publicKey };
}

describe('offline gate check', () => {
  it('valid on the event day, offline, with a fresh list', async () => {
    const ctx = await setup();
    const { pass, publicKey } = await sealed(ctx);
    const list = await listAt(ctx, '2026-11-05T07:00:00+05:30');
    const g = await gateCheck(pass, { publicKey, list, now: EVENT_DAY });
    expect(g).toMatchObject({ result: 'valid', source: 'offline', stale: false });
    expect(g.payload).toMatchObject({ ti: 'Robotics fest', n: 'Riya', ve: 'Hall B', dt: '2026-11-05' });
  });

  it('NOT TODAY the day before and the day after (IST window edges included)', async () => {
    const ctx = await setup();
    const { pass, publicKey } = await sealed(ctx);
    const list = await listAt(ctx);
    for (const [iso, want] of [
      ['2026-11-04T23:59:59+05:30', 'not_today'],
      ['2026-11-05T00:00:00+05:30', 'valid'],
      ['2026-11-05T23:59:59+05:30', 'valid'],
      ['2026-11-06T00:00:00+05:30', 'not_today'],
    ] as const) {
      expect((await gateCheck(pass, { publicKey, list, now: at(iso) })).result, iso).toBe(want);
    }
  });

  it('REVOKED offline, from a signed list synced after the revocation', async () => {
    const ctx = await setup();
    const { id, pass, publicKey } = await sealed(ctx);
    await ctx.as('u_kulkarni').post(`/api/requests/${id}/revoke`, { reason: 'Cancelled', pin: '1234' });
    const g = await gateCheck(pass, { publicKey, list: await listAt(ctx, '2026-11-05T07:00:00+05:30'), now: EVENT_DAY });
    expect(g.result).toBe('revoked');
  });

  it('old v1 pass after an amendment: SUPERSEDED via the list, and NOT TODAY by date even without a sync', async () => {
    const ctx = await setup();
    const { id, pass: v1, publicKey } = await sealed(ctx);
    await ctx.as('u_riya').post(`/api/requests/${id}/amend`, { changes: NEW_PLAN, reason: 'Moved' });
    await ctx.act('u_mehta', id, 'approved');
    await ctx.act('u_kulkarni', id, 'approved');
    const v2 = ctx.db.prepare('SELECT pass FROM seals WHERE request_id = ? AND version = 2').pluck().get(id) as string;
    const newDay = at('2026-11-12T10:00:00+05:30');
    const list = await listAt(ctx, '2026-11-12T07:00:00+05:30');

    expect((await gateCheck(v2, { publicKey, list, now: newDay })).result).toBe('valid');
    expect((await gateCheck(v1, { publicKey, list, now: newDay })).result).toBe('superseded');
    // A guard who never synced: v1 still fails, because its signed date is the old day
    expect((await gateCheck(v1, { publicKey, list: null, now: newDay })).result).toBe('not_today');
  });

  it('the known gap: revoked after the last sync still reads valid offline, but is flagged stale', async () => {
    const ctx = await setup();
    const { id, pass, publicKey } = await sealed(ctx);
    const yesterdays = await listAt(ctx, '2026-11-04T18:00:00+05:30'); // synced before the revocation, not today
    await ctx.as('u_kulkarni').post(`/api/requests/${id}/revoke`, { reason: 'Cancelled', pin: '1234' });
    const offline = await gateCheck(pass, { publicKey, list: yesterdays, now: EVENT_DAY });
    expect(offline).toMatchObject({ result: 'valid', stale: true, source: 'offline' });
    // As soon as there is signal, the live answer wins
    const live = (await ctx.pub(`/api/verify/ref/${id}/1`)).body;
    expect((await gateCheck(pass, { publicKey, list: yesterdays, now: EVENT_DAY, live })).result).toBe('revoked');
  });

  it('a list with a bad signature is ignored (and marked stale); a forged pass is INVALID', async () => {
    const ctx = await setup();
    const { id, pass, publicKey } = await sealed(ctx);
    await ctx.as('u_kulkarni').post(`/api/requests/${id}/revoke`, { reason: 'Cancelled', pin: '1234' });
    const good = await listAt(ctx, '2026-11-05T07:00:00+05:30');
    const tampered = { ...good, list: { ...good.list, entries: [] } }; // attacker removes the entry
    expect(await gateCheck(pass, { publicKey, list: tampered, now: EVENT_DAY })).toMatchObject({ result: 'valid', stale: true, listIssuedAt: null });

    const forged = await encodePass({ rid: id, v: 1, t: 'event_permission', ti: 'Robotics fest', n: 'Riya', d: 'CSE', vf: 0, vu: 2e9, iat: 0 }, '2'.repeat(64));
    expect((await gateCheck(forged, { publicKey, list: good, now: EVENT_DAY })).result).toBe('invalid');
    expect((await gateCheck('not a pass', { publicKey, list: good, now: EVENT_DAY })).result).toBe('invalid');
  });

  it('a list older than 12 hours is stale even on the same day', async () => {
    const ctx = await setup();
    const { pass, publicKey } = await sealed(ctx);
    const early = await listAt(ctx, '2026-11-05T00:05:00+05:30');
    expect((await gateCheck(pass, { publicKey, list: early, now: at('2026-11-05T13:00:00+05:30') })).stale).toBe(true);
    expect((await gateCheck(pass, { publicKey, list: early, now: at('2026-11-05T11:00:00+05:30') })).stale).toBe(false);
  });
});
