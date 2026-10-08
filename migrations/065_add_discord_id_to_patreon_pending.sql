-- Adds discord_id to patreon_pending so /api/auth/patron-status can recognize
-- a stranded patron whose Patreon email ≠ swupod email. Without this column
-- the lookup is email-only, and a patron with mismatched emails who paid +
-- linked Discord on Patreon + isn't in the Pod guild silently slips through
-- every auto-path (Taylor Boumeester was the first observed case, 2026-06-03).
--
-- Populated by:
--   1. webhook 'not_in_guild' branch — has discord_id from payload
--   2. cron not_in_guild branch — has discord_id from Patreon API
--   3. webhook 'no_discord_linked' branch — leaves NULL (we don't have one)
--
-- Backfill: existing rows have discord_id=NULL. The patron-status lookup
-- treats NULL discord_id as "ignore that side of the OR" so legacy rows
-- keep matching by email exactly as before.
ALTER TABLE patreon_pending
  ADD COLUMN IF NOT EXISTS discord_id TEXT;

-- Index for the discord_id-based lookup in patron-status. Partial so we
-- don't index the legacy NULL rows.
CREATE INDEX IF NOT EXISTS idx_patreon_pending_discord_id
  ON patreon_pending (discord_id)
  WHERE discord_id IS NOT NULL;
