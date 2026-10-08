-- Migration 034: Add draft log visibility columns
-- Allows hosts to make entire draft log public, and individual players to make their own log public.

ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS is_log_public BOOLEAN DEFAULT false;
ALTER TABLE draft_pod_players ADD COLUMN IF NOT EXISTS is_log_public BOOLEAN DEFAULT false;
