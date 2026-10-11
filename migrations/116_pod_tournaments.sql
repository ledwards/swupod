-- Pod tournaments: the online event a pod plays after its draft (Swiss with an
-- optional top cut, or single elimination). Separate from the legacy
-- practice_* tables, which keep serving the old competitive Swiss page.
-- Results come from native games; the host may override a match result.
CREATE TABLE IF NOT EXISTS pod_tournaments (
  pod_id UUID PRIMARY KEY REFERENCES pods(id) ON DELETE CASCADE,
  settings JSONB NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','complete')),
  -- Swiss finished and a top cut is next: it pairs on its own at this time.
  cut_starts_at TIMESTAMPTZ,
  started_by UUID REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pod_tournaments_running ON pod_tournaments(cut_starts_at) WHERE status = 'running';

-- The roster is frozen when Round 1 starts.
CREATE TABLE IF NOT EXISTS pod_tournament_entrants (
  pod_id UUID NOT NULL REFERENCES pod_tournaments(pod_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  seat INTEGER NOT NULL,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (pod_id, user_id)
);

CREATE TABLE IF NOT EXISTS pod_tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id UUID NOT NULL REFERENCES pod_tournaments(pod_id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('swiss','elimination')),
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  table_number INTEGER NOT NULL CHECK (table_number > 0),
  player1_id UUID NOT NULL REFERENCES users(id),
  -- NULL is a bye.
  player2_id UUID REFERENCES users(id),
  best_of SMALLINT NOT NULL CHECK (best_of IN (1,3)),
  winner TEXT CHECK (winner IN ('player1','player2','draw')),
  -- A host correction replaces the games' score: ["player1","player2","player1"].
  override_games JSONB CHECK (override_games IS NULL OR jsonb_typeof(override_games) = 'array'),
  overridden_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  UNIQUE (pod_id, stage, round_number, table_number)
);
CREATE INDEX IF NOT EXISTS pod_tournament_matches_open ON pod_tournament_matches(pod_id) WHERE winner IS NULL;

-- One row per game. A native game's id is its ptp_native_matches id, so the
-- engine's result attaches to exactly this game slot. Bot-vs-bot games are
-- resolved on the server ('auto').
CREATE TABLE IF NOT EXISTS pod_tournament_games (
  id UUID PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES pod_tournament_matches(id) ON DELETE CASCADE,
  game_number SMALLINT NOT NULL CHECK (game_number > 0),
  source TEXT NOT NULL CHECK (source IN ('native','auto')),
  result TEXT CHECK (result IN ('player1','player2','draw')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (match_id, game_number)
);
CREATE INDEX IF NOT EXISTS pod_tournament_games_pending ON pod_tournament_games(match_id) WHERE result IS NULL;
