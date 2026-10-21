import { newPrivateKeyHex, publicKeyHex } from '@plc/shared';
import type { DB } from './db.js';

/** Ed25519 issuer key: ISSUER_PRIVATE_KEY if set, otherwise generated once and kept in the kv table. */
export async function issuerKey(db: DB) {
  let priv = process.env.ISSUER_PRIVATE_KEY || (db.prepare("SELECT value FROM kv WHERE key = 'issuer_private_key'").pluck().get() as string | undefined);
  if (!priv) {
    priv = newPrivateKeyHex();
    db.prepare("INSERT INTO kv (key, value) VALUES ('issuer_private_key', ?)").run(priv);
  }
  return { privateKey: priv, publicKey: await publicKeyHex(priv) };
}
