-- Migration 004: Extend draft tables for multiplayer draft feature

-- Create draft_pods table if it doesn't exist (may have been deleted)
CREATE TABLE IF NOT EXISTS draft_pods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id TEXT UNIQUE NOT NULL,
  host_id UUID REFERENCES users(id) ON DELETE SET NULL,
  set_code TEXT NOT NULL,
  status TEXT DEFAULT 'waiting',
  max_players INTEGER DEFAULT 8,
  current_players INTEGER DEFAULT 0,
  settings JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_draft_pods_share_id ON draft_pods(share_id);
CREATE INDEX IF NOT EXISTS idx_draft_pods_host_id ON draft_pods(host_id);

-- Create draft_pod_players table if it doesn't exist
CREATE TABLE IF NOT EXISTS draft_pod_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_pod_id UUID REFERENCES draft_pods(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  player_number INTEGER,
  card_pool_id UUID REFERENCES card_pools(id) ON DELETE SET NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(draft_pod_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_pod_players_pod_id ON draft_pod_players(draft_pod_id);
CREATE INDEX IF NOT EXISTS idx_draft_pod_players_user_id ON draft_pod_players(user_id);

-- Create trigger for updated_at if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_draft_pods_updated_at') THEN
    CREATE TRIGGER update_draft_pods_updated_at BEFORE UPDATE ON draft_pods
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Extend draft_pods table with new columns
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS draft_state JSONB DEFAULT '{}';
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS all_packs JSONB;
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS timer_enabled BOOLEAN DEFAULT true;
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS timer_seconds INTEGER DEFAULT 30;
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS set_name TEXT;
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS state_version INTEGER DEFAULT 0;

-- Extend draft_pod_players table
ALTER TABLE draft_pod_players ADD COLUMN IF NOT EXISTS seat_number INTEGER;
ALTER TABLE draft_pod_players ADD COLUMN IF NOT EXISTS current_pack JSONB;
ALTER TABLE draft_pod_players ADD COLUMN IF NOT EXISTS drafted_cards JSONB DEFAULT '[]';
ALTER TABLE draft_pod_players ADD COLUMN IF NOT EXISTS leaders JSONB DEFAULT '[]';
ALTER TABLE draft_pod_players ADD COLUMN IF NOT EXISTS drafted_leaders JSONB DEFAULT '[]';
ALTER TABLE draft_pod_players ADD COLUMN IF NOT EXISTS pick_status TEXT DEFAULT 'waiting';
ALTER TABLE draft_pod_players ADD COLUMN IF NOT EXISTS last_pick_at TIMESTAMP;
ALTER TABLE draft_pod_players ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP DEFAULT NOW();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_draft_pod_players_seat ON draft_pod_players(draft_pod_id, seat_number);
