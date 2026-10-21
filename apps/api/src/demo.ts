import type { DB } from './db.js';
import { DEMO_PIN, seed } from './seed.js';
import { decide, submitRequest } from './workflow.js';
import { sealRequest, type Services } from './seal.js';

const istDate = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * Reset to the live-demo starting point: demo people, no requests, a fresh contract, and Riya's event
 * permission already approved and sealed as v1, dated a week from today. The demo then amends it to today,
 * so the gate shows VALID for v2 and NOT TODAY / SUPERSEDED for v1.
 */
export async function resetDemo(db: DB, svc: Services) {
  seed(db);
  db.prepare("DELETE FROM kv WHERE key LIKE 'registry_address:%'").run(); // fresh contract for a fresh database state
  svc.chain?.reset();
  const id = submitRequest(db, 'u_riya', 'event_permission', {
    title: 'Robotics fest',
    date: istDate(7),
    venue: 'Hall B',
    headcount: 120,
    purpose: 'Inter-college robotics fest with 6 teams',
  });
  for (const user of ['u_mehta', 'u_kulkarni', 'u_pawar', 'u_rao']) {
    const a = db.prepare("SELECT id FROM approvals WHERE request_id = ? AND assignee_id = ? AND decision = 'pending'").pluck().get(id, user) as number;
    await decide(db, user, a, 'approved', null, DEMO_PIN);
  }
  await sealRequest(db, svc, id);
  return id;
}

if (process.argv[1]?.endsWith('demo.ts')) {
  const { config } = await import('./config.js');
  const { openDb } = await import('./db.js');
  const { chainFromConfig, dbAddressStore } = await import('./chain.js');
  const db = openDb(config.dbPath);
  const chain = chainFromConfig(config, (n) => dbAddressStore(db, n));
  const id = await resetDemo(db, { chain, storageDir: config.storageDir, publicBaseUrl: config.publicBaseUrl });
  const s = db.prepare('SELECT anchor_status FROM seals WHERE request_id = ?').pluck().get(id);
  console.log(`Demo ready: ${id} sealed v1 (${s === 'anchored' ? 'on chain' : 'chain not reachable yet; the API will anchor it when it starts'}). PIN ${DEMO_PIN} for everyone.`);
  process.exit(0);
}
