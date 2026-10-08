-- pool_views: tracks each authenticated user's most recent visit to a pool
-- so we can populate a "Shared" tab in History (pools they viewed but don't own).
--
-- One row per (user_id, pool_id). On revisits, viewed_at is bumped via UPSERT.
-- ON DELETE CASCADE on both FKs so cleanup is automatic when the user or pool
-- is removed.

CREATE TABLE IF NOT EXISTS pool_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool_id UUID NOT NULL REFERENCES card_pools(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pool_views_user_pool_unique UNIQUE (user_id, pool_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_views_user_recent
  ON pool_views (user_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pool_views_pool
  ON pool_views (pool_id);
