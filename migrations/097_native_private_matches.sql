-- Private Baize lifecycle is isolated from legacy client-reported stub results.
-- This is not a second public queue: existing public queue remains unchanged.
CREATE TABLE IF NOT EXISTS ptp_native_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID NOT NULL REFERENCES users(id),
  request_id UUID NOT NULL,
  invite_hash TEXT NOT NULL UNIQUE,
  allow_mismatch BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','starting','active','complete','cancelled')),
  engine_revision TEXT,
  terminal_step BIGINT,
  result TEXT CHECK (result IN ('player1','player2','draw')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(creator_user_id, request_id)
);
CREATE TABLE IF NOT EXISTS ptp_native_match_seats (
  match_id UUID NOT NULL REFERENCES ptp_native_matches(id),
  seat SMALLINT NOT NULL CHECK (seat IN (0,1)),
  user_id UUID NOT NULL REFERENCES users(id),
  deck_version_id UUID NOT NULL REFERENCES ptp_play_deck_versions(id),
  released_at TIMESTAMPTZ,
  PRIMARY KEY(match_id, seat),
  UNIQUE(match_id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ptp_native_one_active_seat ON ptp_native_match_seats(user_id) WHERE released_at IS NULL;
-- New generated sealed pools retain immutable evidence even if the editable pool changes.
CREATE TABLE IF NOT EXISTS ptp_native_pool_evidence (
  source_pool_id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  set_code TEXT NOT NULL,
  pool_type TEXT NOT NULL CHECK (pool_type = 'sealed'),
  pack_count INTEGER NOT NULL CHECK (pack_count > 0),
  cards JSONB NOT NULL CHECK (jsonb_typeof(cards) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS native_pool_evidence_immutable ON ptp_native_pool_evidence;
CREATE TRIGGER native_pool_evidence_immutable BEFORE UPDATE ON ptp_native_pool_evidence
FOR EACH ROW EXECUTE FUNCTION reject_native_deck_version_update();
