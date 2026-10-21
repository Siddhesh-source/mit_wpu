CREATE TABLE IF NOT EXISTS revocations (
  request_id    TEXT NOT NULL REFERENCES requests(id),
  version       INTEGER NOT NULL,
  doc_hash      TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL,
  actor_id      TEXT NOT NULL REFERENCES users(id),
  reason        TEXT NOT NULL,
  reason_code   INTEGER NOT NULL,       -- on chain: 1 = HoD, 2 = Dean SA
  signature     TEXT NOT NULL,          -- issuer Ed25519 over the revocation record
  anchor_status TEXT NOT NULL DEFAULT 'pending',
  tx_hash       TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TEXT NOT NULL,
  anchored_at   TEXT,
  PRIMARY KEY (request_id)
);
