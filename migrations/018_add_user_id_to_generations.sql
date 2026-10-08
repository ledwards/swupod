-- Migration 018: Add user_id to card_generations and index audit
-- Allows querying cards pulled by a specific user

-- Add user_id column to card_generations
ALTER TABLE card_generations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Index for user_id queries
CREATE INDEX IF NOT EXISTS idx_card_generations_user_id ON card_generations(user_id);

-- Composite index for showcase leaders by user query
CREATE INDEX IF NOT EXISTS idx_card_generations_user_showcase_leaders
  ON card_generations(user_id, treatment, card_type)
  WHERE treatment = 'showcase' AND card_type = 'Leader';

-- Composite index for user's cards by set
CREATE INDEX IF NOT EXISTS idx_card_generations_user_set
  ON card_generations(user_id, set_code);

-- ===========================================
-- INDEX AUDIT: Adding missing indices
-- ===========================================

-- card_pools: Add composite index for user's recent pools
CREATE INDEX IF NOT EXISTS idx_card_pools_user_created
  ON card_pools(user_id, created_at DESC);

-- card_pools: Add index for pool_type if it exists
CREATE INDEX IF NOT EXISTS idx_card_pools_pool_type
  ON card_pools(pool_type);

-- draft_pods: Add index for status + created_at for finding active drafts
CREATE INDEX IF NOT EXISTS idx_draft_pods_status_created
  ON draft_pods(status, created_at DESC);

-- draft_pods: Add index for set_code
CREATE INDEX IF NOT EXISTS idx_draft_pods_set_code
  ON draft_pods(set_code);

-- draft_pod_players: Add index for pick_status (for finding players who need to pick)
CREATE INDEX IF NOT EXISTS idx_draft_pod_players_pick_status
  ON draft_pod_players(pick_status);

-- draft_pod_players: Add composite for finding active players in a pod
CREATE INDEX IF NOT EXISTS idx_draft_pod_players_pod_status
  ON draft_pod_players(draft_pod_id, pick_status);

-- card_generations: Add index for card_type (for leader/base queries)
CREATE INDEX IF NOT EXISTS idx_card_generations_card_type
  ON card_generations(card_type);

-- card_generations: Add composite for common stat queries by treatment and type
CREATE INDEX IF NOT EXISTS idx_card_generations_treatment_type
  ON card_generations(treatment, card_type);

-- card_generations: Add index for variant_type
CREATE INDEX IF NOT EXISTS idx_card_generations_variant_type
  ON card_generations(variant_type);
