-- Native snapshots are append-only and never cascade with mutable source pools.
-- Source/owner UUIDs are audit references intentionally without deletion FKs;
-- account-erasure/retention policy must explicitly handle these private records.
-- No historical backfill: current builder state cannot reconstruct old games.
CREATE TABLE IF NOT EXISTS ptp_play_deck_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL,
  source_pool_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pool_id, content_hash),
  CHECK ((snapshot->>'schemaVersion' = '1') IS TRUE),
  CHECK ((snapshot->>'contentHash' = content_hash) IS TRUE),
  CHECK ((snapshot->>'poolId' = pool_id::text) IS TRUE),
  CHECK ((snapshot->>'sourcePoolId' = source_pool_id::text) IS TRUE),
  CHECK ((snapshot->>'ownerUserId' = owner_user_id::text) IS TRUE),
  CHECK (snapshot ?& ARRAY['schemaVersion', 'contentHash', 'poolId', 'sourcePoolId', 'ownerUserId',
    'setCode', 'poolType', 'packCount', 'provenance', 'validationVersion', 'leader', 'base', 'deck'])
);
CREATE INDEX IF NOT EXISTS idx_ptp_play_deck_versions_owner ON ptp_play_deck_versions (owner_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION reject_native_deck_version_update() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Native deck versions are immutable; create a new snapshot instead';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS native_deck_version_immutable ON ptp_play_deck_versions;
CREATE TRIGGER native_deck_version_immutable BEFORE UPDATE ON ptp_play_deck_versions
FOR EACH ROW EXECUTE FUNCTION reject_native_deck_version_update();
-- Explicit administrative DELETE remains available for the eventual retention policy.
