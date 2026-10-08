CREATE TABLE IF NOT EXISTS built_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_pool_id UUID NOT NULL REFERENCES card_pools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  set_code TEXT NOT NULL,
  pool_type TEXT,
  leader JSONB NOT NULL,
  base JSONB NOT NULL,
  deck JSONB NOT NULL,
  sideboard JSONB NOT NULL,
  built_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(card_pool_id)
);

CREATE INDEX IF NOT EXISTS idx_built_decks_user_id ON built_decks(user_id);
CREATE INDEX IF NOT EXISTS idx_built_decks_set_code ON built_decks(set_code);
CREATE INDEX IF NOT EXISTS idx_built_decks_built_at ON built_decks(built_at DESC);
