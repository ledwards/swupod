-- 073_casual_matches_pool_scoped.sql
-- Fix the casual_matches idempotency key.
--
-- 071 keyed idempotency on (user_id, wayfinder_match_id). That breaks when ONE
-- PTP user plays BOTH seats of a single Wayfinder game with two different decks
-- (self-play across two browsers / a logged-out alt seat): both write-backs
-- share (user_id, wayfinder_match_id), so the second deck's row collides with
-- the first via ON CONFLICT and can never be stored. Net effect: only one of
-- the two decks ever logs the game.
--
-- Scope the key to the pool as well, so each deck gets its own row while staying
-- idempotent per (user, deck, match). This is strictly LOOSER than the old index
-- (it adds a column), so no existing row can newly violate it — safe, no dedupe
-- needed.

DROP INDEX IF EXISTS idx_casual_matches_user_match;

CREATE UNIQUE INDEX IF NOT EXISTS idx_casual_matches_user_pool_match
  ON casual_matches(user_id, card_pool_id, wayfinder_match_id)
  WHERE wayfinder_match_id IS NOT NULL;

-- (idx_casual_matches_user on (user_id, played_at DESC) from 071 is unchanged.)
