-- Add hidden column to card_pools for hiding pools from history view
ALTER TABLE card_pools ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false;
