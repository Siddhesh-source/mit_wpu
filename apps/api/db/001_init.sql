CREATE TABLE IF NOT EXISTS departments (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  title         TEXT NOT NULL,
  department_id TEXT NOT NULL REFERENCES departments(id),
  pin_hash      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id       TEXT NOT NULL REFERENCES users(id),
  role          TEXT NOT NULL,
  department_id TEXT NOT NULL REFERENCES departments(id),
  PRIMARY KEY (user_id, role, department_id)
);
