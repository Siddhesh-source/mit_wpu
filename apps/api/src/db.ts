import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type DB = Database.Database;

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db');

/** Open a database and apply every migration in db/ that has not run yet. */
export function openDb(file = ':memory:'): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT name FROM migrations').pluck().all() as string[]);
  for (const name of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    db.transaction(() => {
      db.exec(fs.readFileSync(path.join(MIGRATIONS, name), 'utf8'));
      db.prepare('INSERT INTO migrations (name, at) VALUES (?, ?)').run(name, new Date().toISOString());
    })();
  }
  return db;
}
