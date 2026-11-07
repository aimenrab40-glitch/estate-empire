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
  avatar      TEXT NOT NULL,
  color       TEXT NOT NULL,
  seat        INT  NOT NULL,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_snapshots (
  room_code   TEXT PRIMARY KEY REFERENCES rooms(code) ON DELETE CASCADE,
  state       JSONB NOT NULL,
  chance_deck JSONB NOT NULL DEFAULT '[]',
  chest_deck  JSONB NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotent column backfill for databases created before these columns existed.
ALTER TABLE game_snapshots ADD COLUMN IF NOT EXISTS chance_deck JSONB NOT NULL DEFAULT '[]';
ALTER TABLE game_snapshots ADD COLUMN IF NOT EXISTS chest_deck JSONB NOT NULL DEFAULT '[]';

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

CREATE INDEX IF NOT EXISTS idx_players_room   ON players(room_code);
CREATE INDEX IF NOT EXISTS idx_events_room    ON game_events(room_code, id);
CREATE INDEX IF NOT EXISTS idx_history_recent ON match_history(finished_at DESC);
