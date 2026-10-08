-- Extends patreon_pending with a `reason` discriminator so the
-- /api/auth/patron-status endpoint can pick the right user-facing message.
--
-- Reasons:
--   'no_discord_linked' — webhook fired with no Discord ID in payload
--                         and email lookup also failed. User needs to
--                         link Discord on Patreon.
--   'not_in_guild'      — webhook had a Discord ID, but addPatronRole
--                         returned false because the user isn't in the
--                         Pod Discord server. User needs to join the
--                         server (then the cron or next webhook event
--                         will assign the role).
--
-- Backfill: existing rows have reason=NULL, which patron-status treats
-- as the legacy 'no_discord_linked' case (preserves current behavior).
ALTER TABLE patreon_pending
  ADD COLUMN IF NOT EXISTS reason TEXT;
