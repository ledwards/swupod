-- Track each official Karabast game attempt for a Swiss Practice match.
-- practice_matches remains the match aggregate; this table records per-game
-- lobby lifecycle, replay, result, and retry history.

CREATE TABLE IF NOT EXISTS practice_match_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES practice_matches(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES practice_rounds(id) ON DELETE CASCADE,
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL CHECK (game_number BETWEEN 1 AND 3),
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  status TEXT NOT NULL DEFAULT 'creating' CHECK (
    status IN ('creating', 'lobby_ready', 'in_progress', 'complete', 'failed', 'voided')
  ),
  created_by_user_id UUID REFERENCES users(id),
  lobby_id TEXT,
  lobby_url TEXT,
  spectate_url TEXT,
  wayfinder_match_id TEXT,
  wayfinder_game_id TEXT,
  replay_url TEXT,
  result TEXT CHECK (result IN ('player1', 'player2', 'draw')),
  failure_reason TEXT,
  lifecycle_idempotency_key TEXT,
  result_idempotency_key TEXT,
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  lobby_ready_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, game_number, attempt_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_match_games_active
  ON practice_match_games(match_id, game_number)
  WHERE status IN ('creating', 'lobby_ready', 'in_progress', 'complete');

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_match_games_lifecycle_key
  ON practice_match_games(lifecycle_idempotency_key)
  WHERE lifecycle_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_match_games_result_key
  ON practice_match_games(result_idempotency_key)
  WHERE result_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_match_games_wayfinder_game
  ON practice_match_games(wayfinder_game_id)
  WHERE wayfinder_game_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_practice_match_games_match
  ON practice_match_games(match_id, game_number, attempt_number);

CREATE INDEX IF NOT EXISTS idx_practice_match_games_pod_status
  ON practice_match_games(pod_id, status);

CREATE INDEX IF NOT EXISTS idx_practice_match_games_round
  ON practice_match_games(round_id);
