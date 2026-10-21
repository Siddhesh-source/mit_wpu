CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS request_types (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  fields_json TEXT NOT NULL
);

-- Steps with the same step_no run in parallel.
CREATE TABLE IF NOT EXISTS route_steps (
  request_type     TEXT NOT NULL REFERENCES request_types(code),
  step_no          INTEGER NOT NULL,
  role             TEXT NOT NULL,
  affected_by_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (request_type, role)
);

CREATE TABLE IF NOT EXISTS requests (
  id              TEXT PRIMARY KEY,
  student_id      TEXT NOT NULL REFERENCES users(id),
  department_id   TEXT NOT NULL REFERENCES departments(id),
  type            TEXT NOT NULL REFERENCES request_types(code),
  status          TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  round           INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS request_versions (
  request_id TEXT NOT NULL REFERENCES requests(id),
  version    INTEGER NOT NULL,
  form_json  TEXT NOT NULL,
  form_hash  TEXT NOT NULL,
  reason     TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (request_id, version)
);

-- decision: waiting (later step) | pending | approved | rejected | returned | cancelled | carried
CREATE TABLE IF NOT EXISTS approvals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id   TEXT NOT NULL REFERENCES requests(id),
  version      INTEGER NOT NULL,
  round        INTEGER NOT NULL,
  step_no      INTEGER NOT NULL,
  role         TEXT NOT NULL,
  assignee_id  TEXT NOT NULL REFERENCES users(id),
  decision     TEXT NOT NULL,
  comment      TEXT,
  opened_at    TEXT,
  signed_at    TEXT,
  signature    TEXT,
  carried_from INTEGER REFERENCES approvals(id)
);
CREATE INDEX IF NOT EXISTS approvals_assignee ON approvals (assignee_id, decision);
CREATE INDEX IF NOT EXISTS approvals_request ON approvals (request_id, round);

CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id   TEXT,
  actor_id     TEXT,
  action       TEXT NOT NULL,
  version      INTEGER,
  details_json TEXT NOT NULL DEFAULT '{}',
  at           TEXT NOT NULL
);
