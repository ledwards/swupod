-- Migration 013: Add selected_card_id for selection coordination
-- This tracks which card each player has selected (before final pick)
-- When all players have selected, picks are processed automatically

ALTER TABLE draft_pod_players ADD COLUMN IF NOT EXISTS selected_card_id TEXT;
