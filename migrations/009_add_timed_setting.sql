-- Migration 009: Add timed setting to draft pods

-- Add timed column (whether draft uses timers at all)
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS timed BOOLEAN DEFAULT true;
