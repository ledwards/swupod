-- Optimize stats page queries.
-- The main draft-picks query filters on (set_code, is_leader, picked_at) and
-- groups by (card_name, rarity, card_type). A covering index avoids the seq scan
-- and provides pre-sorted data for the GROUP BY.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_draft_picks_stats
  ON draft_picks (set_code, is_leader, picked_at)
  INCLUDE (card_name, card_id, rarity, card_type, pick_in_pack, draft_pod_id, user_id);

-- The pods join only needs (id, status). Add a partial index for complete pods
-- since that's the only status the stats page queries.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pods_complete
  ON pods (id) WHERE status = 'complete';
