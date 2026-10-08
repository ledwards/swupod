-- Migration 006: Link card_pools to draft_pods

-- Add foreign key to link pools to draft pods
ALTER TABLE card_pools ADD COLUMN IF NOT EXISTS draft_pod_id UUID REFERENCES draft_pods(id) ON DELETE SET NULL;

-- Index for finding pools by draft pod
CREATE INDEX IF NOT EXISTS idx_card_pools_draft_pod_id ON card_pools(draft_pod_id);
