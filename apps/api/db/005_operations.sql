-- Contact for notifications
ALTER TABLE users ADD COLUMN email TEXT;

-- Deadline per step (hours). Past it: nudge; past twice it: escalate.
ALTER TABLE route_steps ADD COLUMN sla_hours INTEGER NOT NULL DEFAULT 48;

-- Delegation + SLA tracking on approvals
ALTER TABLE approvals ADD COLUMN on_behalf_of TEXT REFERENCES users(id);
ALTER TABLE approvals ADD COLUMN nudged_at TEXT;
ALTER TABLE approvals ADD COLUMN escalated_at TEXT;

-- "I'm away from .. to ..; send my approvals to .."
CREATE TABLE IF NOT EXISTS delegations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id),
  delegate_id TEXT NOT NULL REFERENCES users(id),
  starts_on   TEXT NOT NULL,   -- YYYY-MM-DD, IST
  ends_on     TEXT NOT NULL,   -- inclusive
  created_at  TEXT NOT NULL
);

-- Uploaded files. Unlinked until a submit / resubmit / amend claims them.
CREATE TABLE IF NOT EXISTS attachments (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  request_id TEXT REFERENCES requests(id),
  version    INTEGER,
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  sha256     TEXT NOT NULL,
  path       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attachments_request ON attachments (request_id, version);

-- Email outbox: written in the same transaction as the event, delivered by a background loop (log or AWS SES).
CREATE TABLE IF NOT EXISTS outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  to_user    TEXT REFERENCES users(id),
  to_addr    TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body_text  TEXT NOT NULL,
  kind       TEXT NOT NULL,
  request_id TEXT,
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | logged | failed
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at    TEXT
);
