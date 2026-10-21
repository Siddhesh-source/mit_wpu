import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { inject } from 'vitest';
import { HDNodeWallet } from 'ethers';
import { ChainClient, dbAddressStore } from '../src/chain.js';
import type { Services } from '../src/seal.js';
import { openDb } from '../src/db.js';
import { seed, DEMO_PIN } from '../src/seed.js';
import { createApp } from '../src/app.js';

export const RIYA_EVENT = { title: 'Robotics fest', date: '2026-11-05', venue: 'Hall B', headcount: 120, purpose: 'Inter-college robotics fest' };

export const rpcUrl = () => inject('rpcUrl');

/** Hardhat dev account per test worker, so parallel test files never share a nonce. */
const workerKey = HDNodeWallet.fromPhrase(
  'test test test test test test test test test test test junk',
  undefined,
  `m/44'/60'/0'/0/${1 + Number(process.env.VITEST_POOL_ID ?? 0)}`,
).privateKey;

/** Fresh DB, fresh contract on the shared local node, temp PDF storage. */
export async function setup(opts: { rpcUrl?: string; chain?: (db: ReturnType<typeof openDb>) => ChainClient } = {}) {
  const db = openDb();
  seed(db);
  // Remember the contract address exactly like production (in the database's kv table).
  const store = dbAddressStore(db, 'local');
  const chain = opts.chain?.(db) ?? new ChainClient({ network: 'local', rpcUrl: opts.rpcUrl ?? rpcUrl(), privateKey: workerKey, store });
  const svc: Services = { chain, storageDir: fs.mkdtempSync(path.join(os.tmpdir(), 'plc-')), publicBaseUrl: 'http://verify.test' };
  const app = createApp(db, svc);
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

    const pub = (url: string) => request(app).get(url);
  /** Run the full event chain for a fresh request and return its id. */
  async function approvedEvent(form: object = RIYA_EVENT) {
    const id = (await as('u_riya').post('/api/requests', { type: 'event_permission', form })).body.id as string;
    for (const u of ['u_mehta', 'u_pawar', 'u_kulkarni', 'u_rao']) await act(u, id, 'approved');
    return id;
  }

  return { db, app, as, act, login, svc, chain, pub, approvedEvent };
}
