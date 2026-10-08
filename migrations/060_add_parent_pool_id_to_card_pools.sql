-- Migration 060: Add parent_pool_id to card_pools for pool builds feature
-- Enables multiple players to build from a shared parent pool

ALTER TABLE card_pools ADD COLUMN IF NOT EXISTS parent_pool_id UUID REFERENCES card_pools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_card_pools_parent_pool_id ON card_pools (parent_pool_id) WHERE parent_pool_id IS NOT NULL;
