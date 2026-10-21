import { config } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { seed } from './seed.js';
import { chainFromConfig, dbAddressStore } from './chain.js';
import { processQueue, replayAll, type Services } from './seal.js';

const db = openDb(config.dbPath);
if (!db.prepare('SELECT COUNT(*) FROM request_types').pluck().get()) seed(db);

const chain = chainFromConfig(config, (network) => dbAddressStore(db, network), () => {
  replayAll(db);
  console.log('Deployed a fresh DocumentRegistry; re-anchoring stored seals');
});
const svc: Services = { chain, storageDir: config.storageDir, publicBaseUrl: config.publicBaseUrl };

createApp(db, svc).listen(config.port, () => console.log(`API on http://localhost:${config.port} · chain: ${chain?.network ?? 'off'}`));

// Queue-and-retry anchoring: anything that could not reach the chain is retried here.
let busy = false;
const tick = async () => {
  if (busy) return;
  busy = true;
  try {
    await processQueue(db, svc);
  } finally {
    busy = false;
  }
};
setTimeout(tick, 1500);
setInterval(tick, 5000);
