ALTER TABLE presets ADD COLUMN author TEXT;
ALTER TABLE presets ADD COLUMN author_provider TEXT;
ALTER TABLE presets ADD COLUMN author_id TEXT;

CREATE INDEX presets_by_author ON presets (author_id);

CREATE TABLE account_submissions (
  account_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (account_hash, day)
);

CREATE TABLE deleted_presets (
  id INTEGER PRIMARY KEY
);
