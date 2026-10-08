-- migrations/051_add_notes_to_pools.sql
ALTER TABLE card_pools ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;
