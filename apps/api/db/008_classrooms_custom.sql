-- Classrooms: a teacher's group with a join code. Only invited students (by their registered email) can join.
CREATE TABLE IF NOT EXISTS classrooms (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  code       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classroom_members (
  classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id),
  invited_at   TEXT NOT NULL,
  joined_at    TEXT,
  PRIMARY KEY (classroom_id, user_id)
);

-- Custom requests: the signers the student chose (designations, in order), per request.
CREATE TABLE IF NOT EXISTS request_routes (
  request_id       TEXT NOT NULL REFERENCES requests(id),
  step_no          INTEGER NOT NULL,
  role             TEXT NOT NULL,
  affected_by_json TEXT NOT NULL DEFAULT '[]',
  sla_hours        INTEGER NOT NULL DEFAULT 48,
  PRIMARY KEY (request_id, role)
);
