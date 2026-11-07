CREATE TABLE IF NOT EXISTS rooms (
  code          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  max_players   INT  NOT NULL DEFAULT 6,
  host_id       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'lobby',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
  id          TEXT PRIMARY KEY,
  room_code   TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  avatar      TEXT NOT NULL DEFAULT 'tophat',
  image_url   TEXT,
  color       TEXT NOT NULL DEFAULT '#ef4444',
  seat        INT  NOT NULL DEFAULT 0,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotent column backfill for databases created before these columns existed.
ALTER TABLE players ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS game_snapshots (
  room_code   TEXT PRIMARY KEY REFERENCES rooms(code) ON DELETE CASCADE,
  state       JSONB NOT NULL,
  private_roles JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotent column backfills.
ALTER TABLE game_snapshots ADD COLUMN IF NOT EXISTS private_roles JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE game_snapshots ADD COLUMN IF NOT EXISTS chance_deck JSONB;
ALTER TABLE game_snapshots ADD COLUMN IF NOT EXISTS chest_deck JSONB;

CREATE TABLE IF NOT EXISTS game_events (
  id          BIGSERIAL PRIMARY KEY,
  room_code   TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_history (
  id           BIGSERIAL PRIMARY KEY,
  room_code    TEXT NOT NULL,
  room_name    TEXT NOT NULL,
  winner       TEXT,
  player_count INT NOT NULL,
  rounds       INT NOT NULL,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SUPER NOVA accounts (OAuth users) + opaque session tokens.
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  google_sub     TEXT UNIQUE,
  discord_id     TEXT UNIQUE,
  email          TEXT,
  name           TEXT NOT NULL DEFAULT 'Player',
  image_url      TEXT,
  discord_image_url TEXT,
  player_id      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS player_id TEXT;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash     TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_players_room   ON players(room_code);
CREATE INDEX IF NOT EXISTS idx_events_room    ON game_events(room_code, id);
CREATE INDEX IF NOT EXISTS idx_history_recent ON match_history(finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
