-- 071_create_casual_matches.sql
-- Per-match record for NON-competitive (casual) pools played through the
-- Wayfinder Companion. Competitive matches live in practice_matches (which
-- requires a round + pod); casual games have neither and the opponent may not
-- be a PTP user, so they get their own table. Read by /api/stats/me/gameplay
-- so casual games show up in the personal history list alongside competitive
-- ones. Deck identities are populated by the Companion (nullable until sent).

CREATE TABLE IF NOT EXISTS casual_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_pool_id UUID REFERENCES card_pools(id) ON DELETE SET NULL,
  wayfinder_match_id TEXT,
  wayfinder_replay_url TEXT,
  -- Overall result from the user's perspective: 'win' | 'loss' | 'draw'.
  result TEXT,
  -- Per-game results from the user's perspective ('W' | 'L' | 'D'), optional.
  game1_result TEXT,
  game2_result TEXT,
  game3_result TEXT,
  opponent_name TEXT,
  player_leader TEXT,
  player_leader_image TEXT,
  player_base TEXT,
  player_archetype TEXT,
  opponent_leader TEXT,
  opponent_leader_image TEXT,
  opponent_base TEXT,
  opponent_archetype TEXT,
  played_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per (user, wayfinder match) so re-reports are idempotent upserts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_casual_matches_user_match
  ON casual_matches(user_id, wayfinder_match_id)
  WHERE wayfinder_match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_casual_matches_user ON casual_matches(user_id, played_at DESC);
