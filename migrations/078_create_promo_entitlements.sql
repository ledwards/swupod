-- promo_entitlements: per-account grant of a GC promo Event Pack tier.
--
-- One row per (user_id, campaign, promo_tier) — e.g. ('…', 'gc2026', 'silver').
-- The claim endpoint INSERTs with ON CONFLICT DO NOTHING, so re-claiming is an
-- idempotent no-op. Grants are PERMANENT: deliberately NOT revoked when a patron
-- later lapses (Black Packs require Friend-of-the-Pod status only at claim time),
-- so there is no ON DELETE tie to patron state — only ON DELETE CASCADE on the
-- user so rows are cleaned up if the account is removed.

CREATE TABLE IF NOT EXISTS promo_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Campaign key (e.g. 'gc2026'); matches src/services/promoPacks.catalog.ts.
  campaign TEXT NOT NULL,
  -- 'silver' | 'black'.
  promo_tier TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promo_entitlements_user_campaign_tier_unique UNIQUE (user_id, campaign, promo_tier)
);

CREATE INDEX IF NOT EXISTS idx_promo_entitlements_user
  ON promo_entitlements (user_id);
