-- Browser-supplied pools never establish native-play provenance. This server-only
-- artifact retains the unopened 24-pack box while the user picks a 6/8 window.
CREATE TABLE IF NOT EXISTS ptp_solo_sealed_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id),
  request_id UUID NOT NULL,
  share_id TEXT NOT NULL UNIQUE,
  set_code TEXT NOT NULL,
  pack_count INTEGER NOT NULL CHECK (pack_count IN (6,8)),
  box_packs JSONB NOT NULL CHECK (jsonb_typeof(box_packs)='array' AND jsonb_array_length(box_packs)=24),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours',
  UNIQUE(owner_user_id,request_id)
);
CREATE INDEX IF NOT EXISTS ptp_solo_sealed_generation_expiry ON ptp_solo_sealed_generations(expires_at);
DROP TRIGGER IF EXISTS solo_sealed_generation_immutable ON ptp_solo_sealed_generations;
CREATE TRIGGER solo_sealed_generation_immutable BEFORE UPDATE ON ptp_solo_sealed_generations
FOR EACH ROW EXECUTE FUNCTION reject_native_deck_version_update();
