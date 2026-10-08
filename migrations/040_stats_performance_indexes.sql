-- Migration 040: Add composite indexes for stats API performance
-- The stats page queries filter on (set_code + date range + pool_type) but only
-- single-column indexes exist, forcing sequential scans on large tables.

-- card_pools: deck-inclusion (sealed tab) filters set_code + created_at + pool_type
CREATE INDEX IF NOT EXISTS idx_card_pools_set_code_created_at_pool_type
ON card_pools(set_code, created_at DESC, pool_type);

-- built_decks: leader-selection filters set_code + built_at
CREATE INDEX IF NOT EXISTS idx_built_decks_set_code_built_at
ON built_decks(set_code, built_at DESC);

-- draft_picks: draft-picks filters set_code + picked_at + is_leader
CREATE INDEX IF NOT EXISTS idx_draft_picks_set_code_picked_at
ON draft_picks(set_code, picked_at DESC, is_leader);

-- pod_players: covering index for bot filter joins (pod_id + user_id + is_bot)
CREATE INDEX IF NOT EXISTS idx_pod_players_pod_user_bot
ON pod_players(pod_id, user_id, is_bot);

-- pods: Discord chat thread lookups (every message does WHERE discord_thread_id = $1)
CREATE INDEX IF NOT EXISTS idx_pods_discord_thread_id
ON pods(discord_thread_id);

-- card_generations: stats/packs queries filter set_code + generated_at range
CREATE INDEX IF NOT EXISTS idx_card_generations_set_code_generated_at
ON card_generations(set_code, generated_at DESC);
