-- Complete engine records survive runtime upgrades and journal retention.
CREATE TABLE IF NOT EXISTS ptp_native_game_records (
  match_id UUID PRIMARY KEY REFERENCES ptp_native_matches(id),
  schema_version INTEGER NOT NULL CHECK (schema_version=1),
  engine_revision TEXT NOT NULL,
  record_hash TEXT NOT NULL CHECK (length(record_hash)=64),
  record_json JSONB NOT NULL CHECK (jsonb_typeof(record_json)='object'),
  byte_count BIGINT NOT NULL CHECK (byte_count>0),
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS native_game_record_immutable ON ptp_native_game_records;
CREATE TRIGGER native_game_record_immutable BEFORE UPDATE ON ptp_native_game_records
FOR EACH ROW EXECUTE FUNCTION reject_native_deck_version_update();
ALTER TABLE ptp_native_matches ADD COLUMN IF NOT EXISTS next_archive_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE ptp_native_matches ADD COLUMN IF NOT EXISTS archive_error TEXT;
CREATE INDEX IF NOT EXISTS ptp_native_archive_due ON ptp_native_matches(next_archive_at) WHERE status='complete';
