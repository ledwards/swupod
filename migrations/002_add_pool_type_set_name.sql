-- Migration 002: Add pool_type and set_name columns to card_pools table
-- Also set all existing pools to is_public = true

-- Add pool_type column (defaults to 'sealed' for existing pools)
ALTER TABLE card_pools 
ADD COLUMN IF NOT EXISTS pool_type TEXT DEFAULT 'sealed' CHECK (pool_type IN ('sealed', 'draft'));

-- Add set_name column
ALTER TABLE card_pools 
ADD COLUMN IF NOT EXISTS set_name TEXT;

-- Set all existing pools to public
UPDATE card_pools SET is_public = true WHERE is_public = false;

-- Set default is_public to true for new pools
ALTER TABLE card_pools 
ALTER COLUMN is_public SET DEFAULT true;
