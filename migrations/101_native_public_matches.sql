-- Public discovery and Find game share native matches, not a second queue.
ALTER TABLE ptp_native_matches ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public'));
CREATE INDEX IF NOT EXISTS native_public_waiting ON ptp_native_matches(created_at,id) WHERE visibility='public' AND status='waiting';
-- Receipts remember each caller's admission intent, including the joining seat.
CREATE TABLE IF NOT EXISTS ptp_native_public_requests (
  user_id UUID NOT NULL REFERENCES users(id),
  request_id UUID NOT NULL,
  pool_share_id TEXT NOT NULL,
  target_match_id UUID,
  match_id UUID NOT NULL REFERENCES ptp_native_matches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,request_id)
);

ALTER TABLE ptp_native_public_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS native_public_request_rate ON ptp_native_public_requests(user_id,created_at);
