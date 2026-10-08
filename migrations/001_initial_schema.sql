-- Initial database schema for Protect the Pod
-- Run this migration to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  discord_id TEXT UNIQUE,
  google_id TEXT UNIQUE,
  username TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Card pools table
CREATE TABLE IF NOT EXISTS card_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  share_id TEXT UNIQUE NOT NULL,
  set_code TEXT NOT NULL,
  cards JSONB NOT NULL,
  packs JSONB,
  deck_builder_state JSONB,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_pools_share_id ON card_pools(share_id);
CREATE INDEX IF NOT EXISTS idx_card_pools_user_id ON card_pools(user_id);
CREATE INDEX IF NOT EXISTS idx_card_pools_created_at ON card_pools(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_pools_set_code ON card_pools(set_code);

-- Draft pods table (for future draft feature)
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
CREATE INDEX IF NOT EXISTS idx_draft_pods_status ON draft_pods(status);
CREATE INDEX IF NOT EXISTS idx_draft_pods_host_id ON draft_pods(host_id);

-- Draft pod players table (for future draft feature)
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

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_card_pools_updated_at BEFORE UPDATE ON card_pools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_draft_pods_updated_at BEFORE UPDATE ON draft_pods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
