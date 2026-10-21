import { config } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { seed } from './seed.js';

const db = openDb(config.dbPath);
if (!db.prepare('SELECT COUNT(*) FROM request_types').pluck().get()) seed(db);

createApp(db).listen(config.port, () => console.log(`API on http://localhost:${config.port}`));
