import { config } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { seed, syncCatalog } from './seed.js';
import { chainFromConfig, dbAddressStore } from './chain.js';
import { processQueue, replayAll, type Services } from './seal.js';
import { mailerFromConfig, processOutbox } from './notify.js';
import { runSla } from './ops.js';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('Set JWT_SECRET in production (any long random string).');
  process.exit(1);
}

const db = openDb(config.dbPath);
if (!db.prepare('SELECT COUNT(*) FROM request_types').pluck().get()) seed(db);
else syncCatalog(db);

const chain = chainFromConfig(config, (network) => dbAddressStore(db, network), () => {
  replayAll(db);
  console.log('Deployed a fresh DocumentRegistry; re-anchoring stored seals');
});
const svc: Services = {
  chain,
  storageDir: config.storageDir,
  publicBaseUrl: config.publicBaseUrl,
  collegeId: config.collegeId,
  maxUploadMb: config.maxUploadMb,
  slaMinutes: config.slaMinutes,
};
const mailer = mailerFromConfig({ ...config.email, publicBaseUrl: config.publicBaseUrl });

createApp(db, svc).listen(config.port, () =>
  console.log(`API on http://localhost:${config.port} · chain: ${chain?.network ?? 'off'} · email: ${mailer?.name ?? 'off'} · college: ${config.collegeId}`),
);

// Queue-and-retry anchoring: anything that could not reach the chain is retried here.
let busy = false;
const tick = async () => {
  if (busy) return;
  busy = true;
  try {
    await processQueue(db, svc);
    await processOutbox(db, mailer);
  } finally {
    busy = false;
  }
};
setTimeout(tick, 1500);
setInterval(tick, 5000);

// Deadlines: nudge past the SLA, escalate past twice the SLA.
const sla = () => {
  try {
    runSla(db, Date.now(), config.slaMinutes);
  } catch (e) {
    console.error('SLA check failed', e);
  }
};
setInterval(sla, config.slaMinutes ? 15_000 : 60_000);
