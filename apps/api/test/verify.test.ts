import { describe, it, expect } from 'vitest';
import { setup } from './helpers.js';

describe('public verify API', () => {
  it('reports active, unknown and tampered hashes', async () => {
    const { approvedEvent, as, pub } = await setup();
    const id = await approvedEvent();
    const hash: string = (await as('u_riya').get(`/api/requests/${id}`)).body.seal.docHash;
    expect((await pub(`/api/verify/hash/${hash}`)).body.status).toBe('verified');
    const flipped = (hash[0] === 'a' ? 'b' : 'a') + hash.slice(1);
    expect((await pub(`/api/verify/hash/${flipped}`)).body).toEqual({ status: 'not_found', docHash: flipped });
    expect((await pub(`/api/verify/ref/${id}/1`)).body.status).toBe('verified');
    expect((await pub('/api/verify/ref/PLC-1999-0001/1')).body.status).toBe('not_found');
  });

  it('needs no login and is rate limited per client', async () => {
    const { svc } = await setup();
    const request = (await import('supertest')).default;
    const { createApp } = await import('../src/app.js');
    const { openDb } = await import('../src/db.js');
    const app = createApp(openDb(), { ...svc, verifyRateLimit: 3 });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await request(app).get(`/api/verify/hash/${'0'.repeat(64)}`)).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });
});
