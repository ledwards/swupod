-- Migration 059: Add 'imported' pool_type for sheets imported via Claude vision
-- Used by the Import Pool feature (docs/plans/2026-05-05-001-feat-import-pool-spike-plan.md)

-- Drop the existing constraint
ALTER TABLE card_pools DROP CONSTRAINT IF EXISTS card_pools_pool_type_check;

-- Add updated constraint with 'imported' included
ALTER TABLE card_pools ADD CONSTRAINT card_pools_pool_type_check
  CHECK (pool_type IN ('sealed', 'draft', 'pack_blitz', 'pack_wars', 'chaos_sealed', 'rotisserie', 'imported'));
