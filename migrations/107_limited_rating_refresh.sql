-- Published pointers change only after a candidate passes validation.
CREATE TABLE IF NOT EXISTS limited_pick_rating_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('published','rejected')),
  diagnostics JSONB NOT NULL,
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS limited_pick_rating_refresh (
  set_code TEXT PRIMARY KEY,
  published_version_id UUID REFERENCES limited_pick_rating_versions(id),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT
);
