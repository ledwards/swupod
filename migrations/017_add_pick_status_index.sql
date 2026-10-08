-- Add composite index for pick_status queries
-- This is frequently queried during drafting to find players who need to pick

CREATE INDEX IF NOT EXISTS idx_draft_pod_players_pick_status
ON draft_pod_players(draft_pod_id, pick_status);

-- Also add index for the common bot query pattern
CREATE INDEX IF NOT EXISTS idx_draft_pod_players_bot_picking
ON draft_pod_players(draft_pod_id, is_bot, pick_status)
WHERE is_bot = true;
