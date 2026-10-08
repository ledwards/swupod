-- Migration 047: Rename draft_picks.draft_pod_id to pod_id
-- Migration 037 renamed the column in pod_players and card_pools but missed draft_picks.
-- This causes 500 errors in draft-log, me/picks, and user-data endpoints.

ALTER TABLE draft_picks RENAME COLUMN draft_pod_id TO pod_id;

-- Update index name for clarity (index itself remains functional regardless)
DROP INDEX IF EXISTS idx_draft_picks_draft;
CREATE INDEX IF NOT EXISTS idx_draft_picks_pod_id ON draft_picks(pod_id);
