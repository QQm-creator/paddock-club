CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS ratings (
  user_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, entity_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ratings_entity_id_idx ON ratings(entity_id);

CREATE TABLE IF NOT EXISTS circuit_ratings (
  user_id TEXT NOT NULL,
  driver_id TEXT NOT NULL,
  circuit_id TEXT NOT NULL,
  score REAL NOT NULL CHECK (score BETWEEN 1 AND 10),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, driver_id, circuit_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS circuit_ratings_driver_idx
  ON circuit_ratings(driver_id, circuit_id);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS comments_entity_idx
  ON comments(entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_activity (
  user_id TEXT PRIMARY KEY,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_activity_last_seen_idx
  ON user_activity(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS daily_page_views (
  view_date TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  path TEXT NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 1,
  last_viewed_at TEXT NOT NULL,
  PRIMARY KEY (view_date, visitor_id, path)
);

CREATE INDEX IF NOT EXISTS daily_page_views_date_idx
  ON daily_page_views(view_date DESC);
