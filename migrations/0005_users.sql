CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (provider, provider_id)
);

INSERT INTO users (provider, provider_id, name, created_at)
SELECT author_provider, substr(author_id, length(author_provider) + 2), MAX(author), MIN(created_at)
FROM presets
WHERE author_id IS NOT NULL
GROUP BY author_id;

INSERT OR IGNORE INTO users (provider, provider_id, name, created_at)
SELECT substr(author_id, 1, instr(author_id, ':') - 1), substr(author_id, instr(author_id, ':') + 1), substr(author_id, instr(author_id, ':') + 1), 0
FROM saved_presets
GROUP BY author_id;

ALTER TABLE presets ADD COLUMN user_id INTEGER REFERENCES users (id);

UPDATE presets
SET user_id = (SELECT users.id FROM users WHERE users.provider || ':' || users.provider_id = presets.author_id)
WHERE author_id IS NOT NULL;

DROP INDEX presets_by_author;
ALTER TABLE presets DROP COLUMN author;
ALTER TABLE presets DROP COLUMN author_provider;
ALTER TABLE presets DROP COLUMN author_id;

CREATE INDEX presets_by_user ON presets (user_id);

CREATE TABLE saved_presets_new (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id),
  code_hash TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  shared INTEGER,
  UNIQUE (user_id, code_hash)
);

INSERT INTO saved_presets_new (id, user_id, code_hash, code, name, shared)
SELECT saved_presets.id, users.id, code_hash, code, saved_presets.name, shared
FROM saved_presets
JOIN users ON users.provider || ':' || users.provider_id = saved_presets.author_id;

DROP TABLE saved_presets;
ALTER TABLE saved_presets_new RENAME TO saved_presets;
