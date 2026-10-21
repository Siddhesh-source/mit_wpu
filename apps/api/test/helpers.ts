import request from 'supertest';
import { openDb } from '../src/db.js';
import { seed, DEMO_PIN } from '../src/seed.js';
import { createApp } from '../src/app.js';

export const RIYA_EVENT = { title: 'Robotics fest', date: '2026-11-05', venue: 'Hall B', headcount: 120, purpose: 'Inter-college robotics fest' };

export async function setup() {
  const db = openDb();
  seed(db);
  const app = createApp(db);
  const tokens: Record<string, string> = {};
  const login = async (id: string) => {
    tokens[id] = (await request(app).post('/api/auth/login').send({ userId: id, pin: DEMO_PIN })).body.token;
  };
  for (const id of ['u_riya', 'u_mehta', 'u_kulkarni', 'u_rao', 'u_pawar', 'u_admin']) await login(id);
  const as = (id: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${tokens[id]}`),
    post: (url: string, body: object = {}) => request(app).post(url).set('Authorization', `Bearer ${tokens[id]}`).send(body),
  });

  /** Decide the single pending inbox item for this user on this request. */
  async function act(userId: string, requestId: string, decision: string, extra: object = {}) {
    const inbox = (await as(userId).get('/api/inbox')).body as { id: string; approvalId: number }[];
    const item = inbox.find((i) => i.id === requestId);
    if (!item) throw new Error(`${userId} has nothing pending for ${requestId}`);
    return as(userId).post(`/api/approvals/${item.approvalId}/decide`, { decision, pin: DEMO_PIN, comment: decision === 'approved' ? undefined : 'Please fix', ...extra });
  }

  return { db, app, as, act, login };
}
