-- One row per sealed version. doc_hash = SHA-256 of the final PDF bytes (hex, no 0x).
CREATE TABLE IF NOT EXISTS seals (
  request_id    TEXT NOT NULL REFERENCES requests(id),
  version       INTEGER NOT NULL,
  doc_hash      TEXT NOT NULL UNIQUE,
  prev_hash     TEXT,
  roles_hash    TEXT NOT NULL,
  pass          TEXT NOT NULL,
  pdf_path      TEXT NOT NULL,
  valid_from    INTEGER NOT NULL,
  valid_until   INTEGER NOT NULL,
  anchor_status TEXT NOT NULL DEFAULT 'pending',  -- pending | anchored
  chain_status  TEXT NOT NULL DEFAULT 'active',   -- mirror of the chain: active | superseded | revoked
  tx_hash       TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TEXT NOT NULL,
  anchored_at   TEXT,
  PRIMARY KEY (request_id, version)
);
