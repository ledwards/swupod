-- Migration 032: Create draft_picks table
-- Materialized table for fast analytics queries on draft pick data.
-- Replaces the need to explode JSONB arrays (drafted_cards, drafted_leaders)
-- with jsonb_array_elements() for every analytics query.

CREATE TABLE IF NOT EXISTS draft_picks (
  id SERIAL PRIMARY KEY,
  draft_pod_id UUID NOT NULL REFERENCES draft_pods(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  card_id VARCHAR(20) NOT NULL,
  card_name VARCHAR(255) NOT NULL,
  set_code VARCHAR(10) NOT NULL,
  rarity VARCHAR(20) NOT NULL,
  card_type VARCHAR(50) NOT NULL,
  variant_type VARCHAR(50),
  is_leader BOOLEAN DEFAULT FALSE,
  pack_number INTEGER NOT NULL,       -- 1-3 for card picks, 0 for leader picks
  pick_in_pack INTEGER NOT NULL,      -- 1-14 position in pack rotation (or leader round for leaders)
  pick_number INTEGER NOT NULL,       -- overall pick sequence for this player
  leader_round INTEGER,               -- 1-3 for leader picks, NULL for card picks
  picked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_draft_picks_card ON draft_picks(card_name, set_code);
CREATE INDEX idx_draft_picks_draft ON draft_picks(draft_pod_id);
CREATE INDEX idx_draft_picks_user ON draft_picks(user_id);
CREATE INDEX idx_draft_picks_pick_position ON draft_picks(pick_in_pack);
