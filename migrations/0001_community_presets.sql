CREATE TABLE presets (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  downloads INTEGER NOT NULL DEFAULT 0,
  ups INTEGER NOT NULL DEFAULT 0,
  votes INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT -1,
  created_at INTEGER NOT NULL
);

CREATE INDEX presets_by_downloads ON presets (downloads DESC, id DESC);
CREATE INDEX presets_by_rating ON presets (rating DESC, votes DESC, id DESC);
CREATE INDEX presets_by_date ON presets (created_at DESC, id DESC);
CREATE INDEX presets_needing_votes ON presets (votes, id);
CREATE INDEX presets_by_sharer ON presets (ip_hash);

CREATE TABLE preset_votes (
  preset_id INTEGER NOT NULL REFERENCES presets (id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (preset_id, ip_hash)
);

CREATE TABLE preset_downloads (
  preset_id INTEGER NOT NULL REFERENCES presets (id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  PRIMARY KEY (preset_id, ip_hash)
);

CREATE TABLE preset_daily_downloads (
  day INTEGER NOT NULL,
  preset_id INTEGER NOT NULL REFERENCES presets (id) ON DELETE CASCADE,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, preset_id)
);

CREATE TABLE preset_submissions (
  ip_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, day)
);
