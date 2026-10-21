-- Discussion on a request: questions and replies between the student and the people on its chain.
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests(id),
  author_id  TEXT NOT NULL REFERENCES users(id),
  version    INTEGER NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_request ON comments (request_id, id);
