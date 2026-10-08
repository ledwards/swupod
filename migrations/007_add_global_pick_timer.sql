-- Migration 007: Add global pick timer setting

-- Add pick_timeout_seconds column (global timer for all picks)
-- Default 120 seconds (2 minutes)
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS pick_timeout_seconds INTEGER DEFAULT 120;
