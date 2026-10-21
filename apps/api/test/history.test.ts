import { describe, it, expect } from 'vitest';
import { setup } from './helpers.js';

const NEW_PLAN = { date: '2026-11-12', venue: 'Main Auditorium' };

describe('versioned sealing: v1 → v2', () => {
  it('history shows each version, its chain state and who approved which version', async () => {
    const { as, act, approvedEvent } = await setup();
    const id = await approvedEvent();
    await as('u_riya').post(`/api/requests/${id}/amend`, { changes: NEW_PLAN, reason: 'Venue changed' });

    let h = (await as('u_riya').get(`/api/requests/${id}/history`)).body;
    expect(h.map((v: any) => [v.version, v.state])).toEqual([[1, 'active'], [2, 'in_review']]);

    await act('u_mehta', id, 'approved');
    await act('u_kulkarni', id, 'approved');
    h = (await as('u_riya').get(`/api/requests/${id}/history`)).body;
    expect(h.map((v: any) => [v.version, v.state])).toEqual([[1, 'superseded'], [2, 'active']]);
    expect(h[1].reason).toBe('Venue changed');
    expect(h[0].txHash).toMatch(/^0x/);
    expect(h[1].txHash).toMatch(/^0x/);
    expect(h[1].docHash).not.toBe(h[0].docHash);

    const who = (v: any) => v.approvals.map((a: any) => `${a.role}:${a.name}:v${a.signedVersion}${a.carried ? ':carried' : ''}`);
    expect(who(h[0])).toEqual(['faculty_coordinator:Prof. Mehta:v1', 'hod:Prof. Kulkarni:v1', 'security:Mr. Pawar:v1', 'dean_sa:Dr. Rao:v1']);
    expect(who(h[1])).toEqual(['faculty_coordinator:Prof. Mehta:v2', 'hod:Prof. Kulkarni:v2', 'security:Mr. Pawar:v1:carried', 'dean_sa:Dr. Rao:v1:carried']);
    expect(h[1].approvals.every((a: any) => a.signedAt)).toBe(true);
  });

  it('a returned amendment shows as abandoned in the history', async () => {
    const { as, act, approvedEvent } = await setup();
    const id = await approvedEvent();
    await as('u_riya').post(`/api/requests/${id}/amend`, { changes: NEW_PLAN, reason: 'Venue changed' });
    await act('u_mehta', id, 'returned', { comment: 'Not possible' });
    const h = (await as('u_riya').get(`/api/requests/${id}/history`)).body;
    expect(h.map((v: any) => [v.version, v.state])).toEqual([[1, 'active'], [2, 'abandoned']]);
  });

  it('the chain refuses to link from a version that is no longer active', async () => {
    const { as, act, approvedEvent, chain } = await setup();
    const id = await approvedEvent();
    const v1 = (await as('u_riya').get(`/api/requests/${id}`)).body.seal.docHash;
    await as('u_riya').post(`/api/requests/${id}/amend`, { changes: NEW_PLAN, reason: 'x' });
    await act('u_mehta', id, 'approved');
    await act('u_kulkarni', id, 'approved');
    await expect(
      chain.seal({ docHash: 'ab'.repeat(32), issuer: 'COLLEGE-001', requestId: id, docType: 'event_permission', version: 2, prevHash: v1, rolesHash: 'cd'.repeat(32), validFrom: 0, validUntil: 1 }),
    ).rejects.toThrow('Contract refused: PrevNotActive');
  });

  it('history is private to the people on the request', async () => {
    const { as, approvedEvent, pub } = await setup();
    const id = await approvedEvent();
    expect((await pub(`/api/requests/${id}/history`)).status).toBe(401);
    expect((await as('u_rao').get(`/api/requests/${id}/history`)).status).toBe(200);
  });
});
