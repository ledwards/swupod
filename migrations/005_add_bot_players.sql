-- Migration 005: Add bot player support for testing

-- Add is_bot flag to draft_pod_players
ALTER TABLE draft_pod_players ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT false;

-- Create index for finding bot players
CREATE INDEX IF NOT EXISTS idx_draft_pod_players_is_bot ON draft_pod_players(draft_pod_id, is_bot);
