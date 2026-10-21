-- Sign in place: stored signatures, signers chosen by name, signature boxes on the uploaded PDF.

-- One saved signature per person (transparent PNG).
CREATE TABLE IF NOT EXISTS user_signatures (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  png        BLOB NOT NULL,
  kind       TEXT NOT NULL,        -- drawn | typed | uploaded
  updated_at TEXT NOT NULL
);

-- The signature actually used for an approval, captured when it was given.
CREATE TABLE IF NOT EXISTS approval_signatures (
  approval_id INTEGER PRIMARY KEY REFERENCES approvals(id),
  png         BLOB NOT NULL
);

-- A step can name the exact person (documents for signature) and how they sign ("Guide").
ALTER TABLE request_routes ADD COLUMN assignee_id TEXT REFERENCES users(id);
ALTER TABLE request_routes ADD COLUMN label TEXT;

-- Where each signer signs on the document: page (1-based) and a box as fractions of the page, top-left origin.
CREATE TABLE IF NOT EXISTS sign_fields (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id    TEXT NOT NULL REFERENCES requests(id),
  attachment_id TEXT NOT NULL REFERENCES attachments(id),
  step_no       INTEGER NOT NULL,
  page          INTEGER NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS sign_fields_request ON sign_fields (request_id);
