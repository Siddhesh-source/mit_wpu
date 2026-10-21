-- Open sign-up: email + password log in; profile details; student ↔ staff connections; direct sends.
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'staff';   -- student | staff
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN employee_id TEXT;
ALTER TABLE users ADD COLUMN roll_no TEXT;
ALTER TABLE users ADD COLUMN year TEXT;
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN created_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS connections (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   TEXT NOT NULL REFERENCES users(id),
  staff_id     TEXT NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | declined
  created_at   TEXT NOT NULL,
  responded_at TEXT,
  UNIQUE (student_id, staff_id)
);

-- "Document for signature": the person the student sent it to.
ALTER TABLE requests ADD COLUMN recipient_id TEXT REFERENCES users(id);
