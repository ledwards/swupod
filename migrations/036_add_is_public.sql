ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_draft_pods_public_waiting
  ON draft_pods(is_public, status) WHERE is_public = true AND status = 'waiting';
