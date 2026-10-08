-- Migration 016: Add pack_index for pack-level statistics
-- This allows us to analyze statistics at the individual pack level

ALTER TABLE card_generations ADD COLUMN IF NOT EXISTS pack_index INTEGER;

-- Index for pack-level queries
CREATE INDEX IF NOT EXISTS idx_card_generations_pack
  ON card_generations(source_id, pack_index);
