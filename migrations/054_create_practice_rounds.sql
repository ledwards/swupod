CREATE TABLE IF NOT EXISTS practice_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(pod_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_practice_rounds_pod ON practice_rounds(pod_id);
