-- Add pod_type column to draft_pods to distinguish sealed pods from draft pods
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS pod_type TEXT DEFAULT 'draft';
CREATE INDEX IF NOT EXISTS idx_draft_pods_pod_type ON draft_pods(pod_type);
