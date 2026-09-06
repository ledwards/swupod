-- Retraction of a Wayfinder match result that never belonged to this pool.
--
-- Wayfinder forwards a game to a pool when it believes the game was Limited.
-- A requeue race in the Companion (fixed 2026-09-04, wayfinder
-- docs/plans/2026-09-04-001) made some PREMIER games report themselves as
-- Limited, so they were forwarded here and counted against a sealed pool's
-- record. Those are games that never happened in that pool.
--
-- `POST /api/plugin/v1/match/result` is one-way, so fixing Wayfinder does not
-- undo them. This is the reverse gear.
--
-- SOFT delete, never a hard one: the row is the evidence that the forward
-- happened, and a retraction that erased its own subject could not be audited
-- or reversed. Every read path filters on `retracted_at IS NULL`.
ALTER TABLE casual_matches ADD COLUMN IF NOT EXISTS retracted_at TIMESTAMPTZ;
ALTER TABLE casual_matches ADD COLUMN IF NOT EXISTS retracted_reason TEXT;

-- The unique index is partial on `wayfinder_match_id IS NOT NULL` and must stay
-- that way: a retracted row still occupies its (user, match) slot, so a repeat
-- of the same bad forward is refused by the idempotency key rather than
-- creating a second row beside the retracted one.
CREATE INDEX IF NOT EXISTS idx_casual_matches_retracted
  ON casual_matches(retracted_at)
  WHERE retracted_at IS NOT NULL;
