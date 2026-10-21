import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { openDb } from '../src/db.js';
import { seed, DEMO_PIN, PEOPLE, SIGNING_PEOPLE } from '../src/seed.js';
import { createApp } from '../src/app.js';
import { requireAuth, requireRole } from '../src/auth.js';

let app: express.Express;
/** A tiny app with only the guard, to test requireAuth + requireRole in isolation. */
const guarded = express().get('/hod-only', requireAuth, requireRole('hod'), (_req, res) => res.json({ ok: true }));

beforeEach(() => {
  const db = openDb();
  seed(db);
  app = createApp(db);
});

const login = (userId: string, pin = DEMO_PIN) => request(app).post('/api/auth/login').send({ userId, pin });

describe('directory', () => {
  it('lists departments publicly and people only to signed-in users, without contact details or secrets', async () => {
    expect((await request(app).get('/api/departments')).body.map((d: any) => d.id)).toContain('cse');
    expect((await request(app).get('/api/people')).status).toBe(401);
    const token = (await login('u_riya')).body.token;
    const people = (await request(app).get('/api/people').set('Authorization', `Bearer ${token}`)).body;
    expect(people.length).toBe(PEOPLE.length + SIGNING_PEOPLE.length - 1); // everyone but me
    expect(people.find((p: any) => p.id === 'u_kulkarni')).toMatchObject({ name: 'Prof. Kulkarni', kind: 'staff', role: 'hod', roleLabel: 'HoD', initials: 'K' });
    expect(JSON.stringify(people)).not.toMatch(/pin|password|\$2[aby]\$|@campus/i);
  });
});

describe('login', () => {
  it('returns a token and roles for the right PIN', async () => {
    const res = await login('u_kulkarni');
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['hod']);
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body).toMatchObject({ id: 'u_kulkarni', roles: ['hod'], department: 'Computer Science and Engineering' });
  });

  it('refuses a wrong PIN or unknown profile', async () => {
    expect((await login('u_riya', '0000')).status).toBe(401);
    expect((await login('u_nobody')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(401);
  });

  it('refuses /api/me without a valid token', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
    expect((await request(app).get('/api/me').set('Authorization', 'Bearer junk')).status).toBe(401);
  });
});

describe('role guard', () => {
  it('lets the right role through and blocks others', async () => {
    const hod = (await login('u_kulkarni')).body.token;
    const riya = (await login('u_riya')).body.token;
    expect((await request(guarded).get('/hod-only').set('Authorization', `Bearer ${hod}`)).status).toBe(200);
    expect((await request(guarded).get('/hod-only').set('Authorization', `Bearer ${riya}`)).status).toBe(403);
    expect((await request(guarded).get('/hod-only')).status).toBe(401);
  });
});

describe('PIN brute-force protection', () => {
  it('limits login attempts per client', async () => {
    const db = openDb();
    seed(db);
    const limited = createApp(db, { pinRateLimit: 5 });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await request(limited).post('/api/auth/login').send({ userId: 'u_riya', pin: String(1000 + i) })).status);
    expect(codes).toEqual([401, 401, 401, 401, 401, 429, 429]);
  });
});
