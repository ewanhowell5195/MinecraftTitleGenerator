CREATE TABLE saved_presets (
  id INTEGER PRIMARY KEY,
  author_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  shared INTEGER,
  UNIQUE (author_id, code_hash)
);
