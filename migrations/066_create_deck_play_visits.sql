-- deck_play_visits: tracks each authenticated user's visits to a play page,
-- so the personal stats Activity dashboard can show "decks that made it to play."
--
-- One row per (user_id, pool_id). On revisits, last_visited_at is bumped via UPSERT;
-- first_visited_at stays untouched so the activity counter for a date range can
-- count distinct pools by first-play. ON DELETE CASCADE on both FKs so cleanup
-- is automatic when the user or pool is removed.

CREATE TABLE IF NOT EXISTS deck_play_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool_id UUID NOT NULL REFERENCES card_pools(id) ON DELETE CASCADE,
  first_visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT deck_play_visits_user_pool_unique UNIQUE (user_id, pool_id)
);

CREATE INDEX IF NOT EXISTS idx_deck_play_visits_user_recent
  ON deck_play_visits (user_id, first_visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_deck_play_visits_pool
  ON deck_play_visits (pool_id);
