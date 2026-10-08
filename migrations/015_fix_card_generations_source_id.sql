-- Migration 015: Fix card_generations source_id to support UUID
-- The source_id column was INTEGER but pool IDs are UUIDs

-- Drop the existing column and recreate with UUID type
ALTER TABLE card_generations DROP COLUMN IF EXISTS source_id;
ALTER TABLE card_generations ADD COLUMN source_id UUID NOT NULL;

-- Recreate the index
DROP INDEX IF EXISTS idx_card_generations_source;
CREATE INDEX IF NOT EXISTS idx_card_generations_source
  ON card_generations(source_type, source_id);
