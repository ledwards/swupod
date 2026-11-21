-- Stored results of the QA stat aggregates (/api/stats/generations and
-- /api/public/pack-quality). Each one is 15 to 40 passes over card_generations and
-- takes minutes, so it is computed once and kept here instead of per visit.
-- See lib/statCache.ts.
CREATE TABLE IF NOT EXISTS stat_cache (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
