-- Adds the eighth clip slot, `sound-on`, played when a player unmutes.
--
-- 080 pinned clip_type to seven values with a CHECK constraint. That migration
-- is already recorded as applied in production, so editing it would never take
-- effect there — the new value has to arrive as its own migration.
--
-- Idempotent: drops the constraint if present and recreates it with the full
-- set, so re-running is harmless.

ALTER TABLE voice_pack_assets
  DROP CONSTRAINT IF EXISTS voice_pack_assets_clip_type_check;

ALTER TABLE voice_pack_assets
  ADD CONSTRAINT voice_pack_assets_clip_type_check CHECK (
    clip_type IN (
      'greeting',
      'ready-the-draft',
      'start-the-draft',
      'count-30',
      'count-15',
      'count-5',
      'time-is-up',
      'sound-on'
    )
  );
