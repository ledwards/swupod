-- The creator link stops being single-use and becomes a durable EDIT link.
--
-- Migration 080 built the flow around "authored once, never changed": the invite
-- was consumed on submit, the form 404'd afterwards, and the asset routes served
-- the bytes with a one-year `immutable` cache because there was no edit path.
-- There is one now — the creator comes back to the same URL to swap a line,
-- replace the logo or rename the pack — so two things have to change in the
-- schema to make that safe.
--
-- 1. updated_at on voice_packs and voice_pack_assets.
--    The asset/logo routes key their ETag off it, so a replaced clip invalidates
--    the copy every listener already has. Without this, editing a pack would
--    "succeed" and change nothing anyone hears for up to a year.
--
-- 2. ONE PACK PER INVITE, as a database fact.
--    The submit route decides insert-vs-update by asking whether this invite has
--    a pack yet. The atomic used_at claim already serializes the first insert, but
--    the same reasoning migration 080 applied to `code` applies here: uniqueness
--    that matters should be enforced by an index, not by a race-prone precheck.
--    Partial, because invite_id is ON DELETE SET NULL — packs whose invite row was
--    removed all hold NULL and must not collide with each other.

ALTER TABLE voice_packs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE voice_pack_assets
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_packs_one_per_invite
  ON voice_packs (invite_id)
  WHERE invite_id IS NOT NULL;
