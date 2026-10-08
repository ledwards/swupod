ALTER TABLE ptp_native_matches ADD COLUMN IF NOT EXISTS next_reconcile_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS ptp_native_reconcile_due ON ptp_native_matches(next_reconcile_at) WHERE status IN ('starting','active');
CREATE TABLE IF NOT EXISTS ptp_native_session_revocations (
  subject UUID PRIMARY KEY,
  request_id UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
