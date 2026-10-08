-- Track Patreon members who subscribed but don't have Discord linked on Patreon.
-- When the webhook fires without a Discord connection, we record it here so we
-- can warn the user to link their Discord account on patreon.com.
CREATE TABLE IF NOT EXISTS patreon_pending (
  email TEXT PRIMARY KEY,
  patreon_name TEXT,
  event TEXT,
  patron_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
