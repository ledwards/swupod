-- Adds the pause/resume clips, played when the host stops or restarts the timer.
--
-- Like 082, this replaces the CHECK constraint rather than editing the
-- migration that created it: 080 is already applied in production and can
-- never be changed. Idempotent — drop-if-exists then recreate.

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
      'sound-on',
      'timer-paused',
      'timer-resumed'
    )
  );
