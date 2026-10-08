-- Pod-level override that re-opens deck editing during Swiss Practice.
-- When false (default), competitive decks lock once matchmaking is active or
-- the build deadline passes. The pod owner can flip this to true to let every
-- player edit their primary deck again (and flip it back to re-lock).
ALTER TABLE pods ADD COLUMN IF NOT EXISTS decks_unlocked BOOLEAN NOT NULL DEFAULT false;
