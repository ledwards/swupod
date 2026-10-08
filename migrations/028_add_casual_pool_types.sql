-- Migration 028: Add casual format pool types to card_pools constraint
-- Adds support for: pack_blitz, pack_wars, chaos_sealed, rotisserie

-- Drop the existing constraint
ALTER TABLE card_pools DROP CONSTRAINT IF EXISTS card_pools_pool_type_check;

-- Add updated constraint with new pool types
ALTER TABLE card_pools ADD CONSTRAINT card_pools_pool_type_check
  CHECK (pool_type IN ('sealed', 'draft', 'pack_blitz', 'pack_wars', 'chaos_sealed', 'rotisserie'));
