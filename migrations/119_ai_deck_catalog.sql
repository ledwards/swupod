-- Leebo's saved decks, refreshed daily: 20 per format (Premier and Eternal from
-- Wayfinder's /api/ai/saved-decks, Draft and Sealed from PTP's own built decks).
-- One row; data/ai-decks.json is the fallback until the first refresh lands.
CREATE TABLE IF NOT EXISTS ptp_ai_deck_catalog (
  id TEXT PRIMARY KEY CHECK (id = 'current'),
  decks JSONB NOT NULL,
  version TEXT NOT NULL,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
