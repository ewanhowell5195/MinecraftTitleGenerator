CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  unlimited_shares INTEGER NOT NULL DEFAULT 0,
  UNIQUE (provider, provider_id)
);

CREATE TABLE presets (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  fingerprint TEXT,
  name TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  downloads INTEGER NOT NULL DEFAULT 0,
  ups INTEGER NOT NULL DEFAULT 0,
  votes INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT -1,
  created_at INTEGER,
  user_id INTEGER REFERENCES users (id),
  token_hash TEXT,
  shared INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX presets_by_fingerprint ON presets (fingerprint) WHERE shared = 1;
CREATE UNIQUE INDEX presets_by_user_code ON presets (user_id, code);
CREATE INDEX presets_by_downloads ON presets (downloads DESC, id DESC) WHERE shared = 1;
CREATE INDEX presets_by_rating ON presets (rating DESC, votes DESC, id DESC) WHERE shared = 1;
CREATE INDEX presets_by_date ON presets (created_at DESC, id DESC) WHERE shared = 1;
CREATE INDEX presets_needing_votes ON presets (votes, id) WHERE shared = 1;

CREATE TABLE preset_votes (
  preset_id INTEGER NOT NULL REFERENCES presets (id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (preset_id, ip_hash)
);

CREATE INDEX preset_votes_by_voter ON preset_votes (ip_hash);

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

CREATE TABLE account_submissions (
  account_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (account_hash, day)
);

CREATE TABLE deleted_presets (
  id INTEGER PRIMARY KEY
);

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users (id),
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  asset TEXT NOT NULL,
  name TEXT NOT NULL,
  credit TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '{}',
  file TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  pull INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX submissions_by_user ON submissions (user_id, id DESC);
CREATE INDEX submissions_by_pull ON submissions (pull);
CREATE INDEX submissions_by_status ON submissions (status, target);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id),
  submission_id INTEGER NOT NULL REFERENCES submissions (id),
  kind TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  seen INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX notifications_by_user ON notifications (user_id, id DESC);
