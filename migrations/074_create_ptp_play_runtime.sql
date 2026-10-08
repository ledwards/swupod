-- PTP-owned limited play runtime ledger.
--
-- This is intentionally separate from practice_matches/practice_match_games.
-- The existing tables model Swiss Practice events launched through Wayfinder;
-- these tables model a PTP queue, private runtime handoff, replay events, and
-- result capture for a Forceteki/Karabast clone.

CREATE TABLE IF NOT EXISTS ptp_play_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  format TEXT NOT NULL DEFAULT 'limited' CHECK (format IN ('limited')),
  pool_type TEXT NOT NULL,
  set_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'matched' CHECK (
    status IN ('matched', 'launch_ready', 'in_progress', 'complete', 'failed', 'cancelled')
  ),
  runtime_mode TEXT NOT NULL DEFAULT 'local_stub' CHECK (runtime_mode IN ('local_stub', 'forceteki')),
  runtime_game_id TEXT UNIQUE,
  runtime_launch_url TEXT,
  spectate_url TEXT,
  replay_url TEXT,
  player1_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player2_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player1_pool_id UUID NOT NULL REFERENCES card_pools(id) ON DELETE CASCADE,
  player2_pool_id UUID NOT NULL REFERENCES card_pools(id) ON DELETE CASCADE,
  winner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  result TEXT CHECK (result IN ('player1', 'player2', 'draw')),
  result_reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  result_idempotency_key TEXT UNIQUE,
  failure_reason TEXT,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptp_play_matches_player1
  ON ptp_play_matches(player1_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ptp_play_matches_player2
  ON ptp_play_matches(player2_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ptp_play_matches_status
  ON ptp_play_matches(status, created_at DESC);

CREATE TABLE IF NOT EXISTS ptp_play_queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_pool_id UUID NOT NULL REFERENCES card_pools(id) ON DELETE CASCADE,
  pool_share_id TEXT NOT NULL,
  set_code TEXT NOT NULL,
  pool_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'matched', 'cancelled', 'expired', 'launch_failed')
  ),
  match_id UUID REFERENCES ptp_play_matches(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '45 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ptp_play_queue_active_pool
  ON ptp_play_queue_entries(user_id, card_pool_id)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_ptp_play_queue_matchmaking
  ON ptp_play_queue_entries(set_code, pool_type, requested_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_ptp_play_queue_user
  ON ptp_play_queue_entries(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ptp_play_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES ptp_play_matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_pool_id UUID NOT NULL REFERENCES card_pools(id) ON DELETE CASCADE,
  seat TEXT NOT NULL CHECK (seat IN ('player1', 'player2')),
  launch_token TEXT NOT NULL UNIQUE,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, seat),
  UNIQUE(match_id, user_id, card_pool_id)
);

CREATE INDEX IF NOT EXISTS idx_ptp_play_seats_user
  ON ptp_play_seats(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ptp_play_seats_match
  ON ptp_play_seats(match_id);

CREATE TABLE IF NOT EXISTS ptp_play_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES ptp_play_matches(id) ON DELETE CASCADE,
  seat_id UUID REFERENCES ptp_play_seats(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptp_play_events_match
  ON ptp_play_events(match_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ptp_play_events_type
  ON ptp_play_events(event_type, created_at DESC);
