-- Open Games: 1v1 casual lobby listings (Lobby V1, R6/R18-R23/R29-R34/R37).
-- One row carries listing -> match; Karabast lobby attempts live in the
-- open_game_lobby_attempts child table (practice_match_games semantics) so
-- retry/staleness/newest-lobby-wins machinery carries over.

CREATE TABLE IF NOT EXISTS open_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'accepted', 'lobby_ready', 'in_progress', 'complete',
               'cancelled', 'expired', 'delisted', 'abandoned')
  ),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  set_code TEXT NOT NULL,
  set_name TEXT,
  format TEXT NOT NULL,
  player1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player1_pool_id UUID NOT NULL REFERENCES card_pools(id) ON DELETE CASCADE,
  player2_id UUID REFERENCES users(id) ON DELETE SET NULL,
  player2_pool_id UUID REFERENCES card_pools(id) ON DELETE SET NULL,
  -- Karabast-side joiner with no PTP identity (R37): match proceeds one-sided.
  player2_external BOOLEAN NOT NULL DEFAULT FALSE,
  result TEXT CHECK (result IN ('player1', 'player2', 'draw')),
  wayfinder_match_id TEXT,
  result_idempotency_key TEXT,
  discord_message_id TEXT,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- R19: at most one open listing per user (posting again replaces it in the
-- service; this index is the backstop).
CREATE UNIQUE INDEX IF NOT EXISTS idx_open_games_one_open_listing
  ON open_games(player1_id)
  WHERE status = 'open';

-- R19: at most one pending match per seat side. Cross-side overlap
-- (player1 in one row, player2 in another) is enforced by advisory locks in
-- the accept transaction; these are the per-side backstops.
CREATE UNIQUE INDEX IF NOT EXISTS idx_open_games_one_pending_p1
  ON open_games(player1_id)
  WHERE status IN ('accepted', 'lobby_ready', 'in_progress');

CREATE UNIQUE INDEX IF NOT EXISTS idx_open_games_one_pending_p2
  ON open_games(player2_id)
  WHERE status IN ('accepted', 'lobby_ready', 'in_progress') AND player2_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_open_games_result_key
  ON open_games(result_idempotency_key)
  WHERE result_idempotency_key IS NOT NULL;

-- Board listing + sweep scans.
CREATE INDEX IF NOT EXISTS idx_open_games_board
  ON open_games(status, visibility, created_at);

CREATE INDEX IF NOT EXISTS idx_open_games_player2
  ON open_games(player2_id)
  WHERE player2_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS open_game_lobby_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  open_game_id UUID NOT NULL REFERENCES open_games(id) ON DELETE CASCADE,
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
  failure_reason TEXT,
  lifecycle_idempotency_key TEXT,
  result_idempotency_key TEXT,
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  lobby_ready_at TIMESTAMPTZ,
  opponent_joined_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(open_game_id, attempt_number)
);

-- Newest-lobby-wins: only one live attempt per game.
CREATE UNIQUE INDEX IF NOT EXISTS idx_open_game_attempts_active
  ON open_game_lobby_attempts(open_game_id)
  WHERE status IN ('creating', 'lobby_ready', 'in_progress', 'complete');

CREATE UNIQUE INDEX IF NOT EXISTS idx_open_game_attempts_lifecycle_key
  ON open_game_lobby_attempts(lifecycle_idempotency_key)
  WHERE lifecycle_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_open_game_attempts_result_key
  ON open_game_lobby_attempts(result_idempotency_key)
  WHERE result_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_open_game_attempts_wayfinder_game
  ON open_game_lobby_attempts(wayfinder_game_id)
  WHERE wayfinder_game_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_open_game_attempts_lobby
  ON open_game_lobby_attempts(lobby_id)
  WHERE lobby_id IS NOT NULL;
