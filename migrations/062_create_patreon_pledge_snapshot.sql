-- One-time defensive snapshot of patron pledge amounts captured BEFORE the
-- 2026 price raise. Used purely as an audit trail for dispute resolution
-- ("I thought I was grandfathered at $5/mo") — NOT a gating mechanism.
--
-- Patron status, role assignment, and access decisions continue to be sourced
-- from Discord guild membership (lib/discord.ts → lib/patreon.ts), not this
-- table. This snapshot answers "what was each patron paying at the moment of
-- the raise?" — nothing more.
--
-- Populated by scripts/snapshot-patrons.ts (one-time, idempotent on patron_id).
-- Safe to re-run; ON CONFLICT updates the snapshot timestamp + amount so a
-- second run reflects current state without duplicating rows.
CREATE TABLE IF NOT EXISTS patreon_pledge_snapshot (
  patron_id TEXT PRIMARY KEY,
  discord_id TEXT,
  email TEXT,
  full_name TEXT,
  patron_status TEXT,
  pledge_amount_cents INT,
  pledge_started_at TIMESTAMPTZ,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Looking up by Discord ID is the common dispute-resolution path
-- (patron asks in Discord; we cross-reference their pledge state).
CREATE INDEX IF NOT EXISTS idx_patreon_pledge_snapshot_discord
  ON patreon_pledge_snapshot (discord_id)
  WHERE discord_id IS NOT NULL;

-- Email is the secondary lookup path when Discord isn't linked.
CREATE INDEX IF NOT EXISTS idx_patreon_pledge_snapshot_email
  ON patreon_pledge_snapshot (email)
  WHERE email IS NOT NULL;
