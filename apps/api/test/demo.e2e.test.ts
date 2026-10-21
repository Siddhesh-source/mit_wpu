import { describe, it, expect } from 'vitest';
import { JsonRpcProvider, toUtf8String } from 'ethers';
import { gateCheck, sha256Hex, type SignedRevocationList } from '@plc/shared';
import { setup, RIYA_EVENT, rpcUrl } from './helpers.js';

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const pdf = async (ctx: any, id: string, v: number) => {
  const res = await ctx.as('u_riya').get(`/api/requests/${id}/pdf?v=${v}`).buffer(true).parse((r: any, cb: any) => {
    const c: Buffer[] = [];
    r.on('data', (d: Buffer) => c.push(d));
    r.on('end', () => cb(null, Buffer.concat(c)));
  });
  return res.body as Buffer;
};

/** The live demo script, end to end, in order (docs/DEMO.md). */
describe('live demo script', () => {
  it('a → h: submit, route, sign, seal, verify; amend, v2, supersede; gate; revoke; tamper; other types', async () => {
    const ctx = await setup();
    const { as, act, pub, chain, db } = ctx;
    const { publicKey } = (await pub('/api/issuer-public-key')).body;
    const list = async (): Promise<SignedRevocationList> => (await pub('/api/revocations')).body;

    // a. Riya submits
    const id = (await as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;

    // b. coordinator → HoD ‖ Security → Dean SA → sealed v1 → verified (file and QR)
    await act('u_mehta', id, 'approved');
    await act('u_kulkarni', id, 'approved');
    await act('u_pawar', id, 'approved');
    await act('u_rao', id, 'approved');
    const v1 = await pdf(ctx, id, 1);
    const v1Hash = sha256Hex(v1);
    expect((await pub(`/api/verify/hash/${v1Hash}`)).body.status).toBe('verified');
    expect((await pub(`/api/verify/ref/${id}/1`)).body.status).toBe('verified');

    // c. date + venue change: only coordinator and HoD
    const amended = (await as('u_riya').post(`/api/requests/${id}/amend`, { changes: { date: '2026-11-12', venue: 'Main Auditorium' }, reason: 'Hall B under repair' })).body;
    expect(amended.timeline.filter((s: any) => s.decision === 'carried').map((s: any) => s.role).sort()).toEqual(['dean_sa', 'security']);
    expect((await as('u_pawar').get('/api/inbox')).body).toHaveLength(0);
    expect((await as('u_rao').get('/api/inbox')).body).toHaveLength(0);

    // d. v2 sealed and linked; v1 superseded; history shows who approved which version
    await act('u_mehta', id, 'approved');
    await act('u_kulkarni', id, 'approved');
    const v2 = await pdf(ctx, id, 2);
    const v2Hash = sha256Hex(v2);
    expect((await chain.get(v2Hash)).prevHash).toBe(v1Hash);
    const v1Check = (await pub(`/api/verify/hash/${v1Hash}`)).body;
    expect(v1Check.status).toBe('superseded');
    expect(v1Check.latest.version).toBe(2);
    expect((await pub(`/api/verify/hash/${v2Hash}`)).body.status).toBe('verified');
    const h = (await as('u_riya').get(`/api/requests/${id}/history`)).body;
    expect(h[1].approvals.map((a: any) => `${a.role}@v${a.signedVersion}`)).toEqual(['faculty_coordinator@v2', 'hod@v2', 'security@v1', 'dean_sa@v1']);

    // e. gate on the new date, offline with a synced list
    const passOf = (v: number) => db.prepare('SELECT pass FROM seals WHERE request_id = ? AND version = ?').pluck().get(id, v) as string;
    const newDay = at('2026-11-12T10:00:00+05:30');
    const synced = await list();
    expect((await gateCheck(passOf(2), { publicKey, list: synced, now: newDay })).result).toBe('valid');
    expect((await gateCheck(passOf(1), { publicKey, list: synced, now: newDay })).result).toBe('superseded');
    expect((await gateCheck(passOf(1), { publicKey, list: null, now: newDay })).result).toBe('not_today');

    // f. HoD revokes: verify says Revoked for v2 and v1; gate with a fresh list says REVOKED; with the old list it is the documented gap
    expect((await as('u_kulkarni').post(`/api/requests/${id}/revoke`, { reason: 'Event cancelled', pin: '1234' })).status).toBe(200);
    expect((await pub(`/api/verify/hash/${v2Hash}`)).body.status).toBe('revoked');
    expect((await pub(`/api/verify/hash/${v1Hash}`)).body.status).toBe('revoked');
    expect((await gateCheck(passOf(2), { publicKey, list: await list(), now: newDay })).result).toBe('revoked');
    const stale = { ...synced, list: { ...synced.list } }; // list from before the revocation (re-used as-is: signature still valid)
    const gap = await gateCheck(passOf(2), { publicKey, list: stale, now: newDay });
    expect(gap.result).toBe('valid');
    expect(gap.stale).toBe(true); // synced on another day → flagged

    // g. one-byte edit → tampered (not found)
    const edited = Buffer.from(v2);
    edited[200] ^= 0x20;
    expect((await pub(`/api/verify/hash/${sha256Hex(edited)}`)).body.status).toBe('not_found');

    // h. on-duty and bonafide still flow submit → approve → seal → verify
    const od = (await as('u_riya').post('/api/requests', { type: 'on_duty', form: { title: 'Seminar', date: '2026-11-10' } })).body.id;
    await act('u_mehta', od, 'approved');
    await act('u_kulkarni', od, 'approved');
    const bf = (await as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Scholarship' } })).body.id;
    await act('u_kulkarni', bf, 'approved');
    await act('u_rao', bf, 'approved');
    for (const x of [od, bf]) {
      const d = (await as('u_riya').get(`/api/requests/${x}`)).body;
      expect(d.status).toBe('sealed');
      expect((await pub(`/api/verify/hash/${d.seal.docHash}`)).body.status).toBe('verified');
    }

    // No personal data ever reaches the chain: scan every transaction's calldata
    const provider = new JsonRpcProvider(rpcUrl(), undefined, { staticNetwork: true });
    const txs = [
      ...(db.prepare('SELECT tx_hash FROM seals').pluck().all() as string[]),
      ...(db.prepare('SELECT tx_hash FROM revocations').pluck().all() as string[]),
    ];
    expect(txs.length).toBe(5);
    for (const tx of txs) {
      const data = (await provider.getTransaction(tx))!.data;
      const text = toUtf8String(data.slice(0, 2) + data.slice(10).replace(/00/g, ''), () => '');
      for (const personal of ['Riya', 'Mehta', 'Kulkarni', 'Rao', 'Pawar', 'Hall B', 'Auditorium', 'Robotics', 'Computer Science', 'Scholarship', 'Seminar']) {
        expect(text, `${tx} leaks ${personal}`).not.toContain(personal);
      }
    }
  });
});

describe('demo tooling', () => {
  it('admin reset gives a fresh contract and Riya sealed v1 dated a week out; only admin can do it', async () => {
    const { as, pub } = await setup({ chain: undefined });
    expect((await as('u_kulkarni').post('/api/admin/reset-demo')).status).toBe(403);
    const res = await as('u_admin').post('/api/admin/reset-demo');
    expect(res.status).toBe(200);
    const d = (await as('u_riya').get(`/api/requests/${res.body.id}`)).body;
    expect(d.status).toBe('sealed');
    expect(d.form.title).toBe('Robotics fest');
    const inAWeek = new Date(Date.now() + 7 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    expect(d.form.date).toBe(inAWeek);
    expect((await pub(`/api/verify/hash/${d.seal.docHash}`)).body.status).toBe('verified');
    // a second reset starts over: same id, new contract, still sealed
    const again = await as('u_admin').post('/api/admin/reset-demo');
    expect(again.body.id).toBe(res.body.id);
    expect((await as('u_admin').get('/api/admin/requests')).body).toHaveLength(1);
    expect((await as('u_riya').get(`/api/requests/${again.body.id}`)).body.status).toBe('sealed');
  });

  it('admin lists every request; others cannot', async () => {
    const { as, approvedEvent } = await setup();
    await approvedEvent();
    await as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } });
    const all = (await as('u_admin').get('/api/admin/requests')).body;
    expect(all.map((r: any) => r.status).sort()).toEqual(['in_review', 'sealed']);
    expect((await as('u_riya').get('/api/admin/requests')).status).toBe(403);
  });

  it('unknown API paths are JSON 404s and security headers are set', async () => {
    const { pub } = await setup();
    const res = await pub('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
