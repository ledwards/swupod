-- Two-step picking: staging a selection is no longer the same as committing it.
--
-- A player clicks a card (pick_status = 'selected', selection_confirmed = false)
-- and can still change their mind; the round only advances once every player is
-- confirmed. Bots stage and confirm in the same write, so they never hold the
-- table up. Without this column a solo-vs-bots draft advanced on the human's
-- first click, because every bot was already staged.
ALTER TABLE pod_players
  ADD COLUMN IF NOT EXISTS selection_confirmed BOOLEAN NOT NULL DEFAULT false;

-- Selections staged before this migration predate the confirm step. Treat them
-- as confirmed so in-flight drafts don't hang waiting for a confirmation their
-- client never had a button for.
UPDATE pod_players
SET selection_confirmed = true
WHERE pick_status = 'selected' AND selected_card_id IS NOT NULL;
