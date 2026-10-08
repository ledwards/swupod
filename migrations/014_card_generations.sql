-- Migration 004: Card Generations Tracking
-- This table records every card generated in packs for statistical analysis

CREATE TABLE IF NOT EXISTS card_generations (
  id SERIAL PRIMARY KEY,

  -- Card identification
  card_id VARCHAR(20) NOT NULL,  -- e.g., "SOR-001"
  set_code VARCHAR(10) NOT NULL, -- e.g., "SOR", "SHD", "TWI"
  card_name VARCHAR(255) NOT NULL,
  card_subtitle VARCHAR(255),
  card_type VARCHAR(50) NOT NULL, -- Unit, Event, Upgrade, Leader, Base
  rarity VARCHAR(20) NOT NULL,    -- Common, Uncommon, Rare, Legendary
  aspects TEXT[],                 -- Array of aspects

  -- Treatment/variant information
  treatment VARCHAR(50) NOT NULL, -- 'base', 'hyperspace', 'foil', 'hyperspace_foil', 'showcase'
  variant_type VARCHAR(50) NOT NULL, -- Normal, Hyperspace, Showcase
  is_foil BOOLEAN DEFAULT FALSE,
  is_hyperspace BOOLEAN DEFAULT FALSE,
  is_showcase BOOLEAN DEFAULT FALSE,

  -- Pack information
  pack_type VARCHAR(50) NOT NULL, -- 'booster', 'leader'
  slot_type VARCHAR(50),          -- 'leader', 'base', 'common', 'uncommon', 'rare_legendary', 'foil'

  -- Source tracking
  source_type VARCHAR(50) NOT NULL, -- 'draft', 'sealed'
  source_id INTEGER NOT NULL,       -- ID of the draft_pod or pool
  source_share_id VARCHAR(50),      -- Share ID for easier querying

  -- Timestamps
  generated_at TIMESTAMP DEFAULT NOW(),

  -- Indexes for efficient querying
  CONSTRAINT card_generations_check_treatment CHECK (
    treatment IN ('base', 'hyperspace', 'foil', 'hyperspace_foil', 'showcase')
  ),
  CONSTRAINT card_generations_check_pack_type CHECK (
    pack_type IN ('booster', 'leader')
  ),
  CONSTRAINT card_generations_check_source_type CHECK (
    source_type IN ('draft', 'sealed')
  )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_card_generations_card_id ON card_generations(card_id);
CREATE INDEX IF NOT EXISTS idx_card_generations_set_code ON card_generations(set_code);
CREATE INDEX IF NOT EXISTS idx_card_generations_treatment ON card_generations(treatment);
CREATE INDEX IF NOT EXISTS idx_card_generations_generated_at ON card_generations(generated_at);
CREATE INDEX IF NOT EXISTS idx_card_generations_source ON card_generations(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_card_generations_rarity ON card_generations(rarity);
CREATE INDEX IF NOT EXISTS idx_card_generations_slot_type ON card_generations(slot_type);

-- Composite index for common stat queries
CREATE INDEX IF NOT EXISTS idx_card_generations_stats
  ON card_generations(set_code, card_id, treatment, pack_type);
