-- Add name column to pods table for user-editable pod names
ALTER TABLE pods ADD COLUMN IF NOT EXISTS name TEXT;
