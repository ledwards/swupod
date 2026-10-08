-- "Findable by Karabast users" — the host's choice, at post time, to have the
-- Companion publish this lobby to Karabast's PUBLIC game list rather than
-- creating a link-only private one.
--
-- Until now this choice was never persisted: it lived only in the browser
-- (PostGameModal state + a localStorage preference) and was consumed inline by
-- the create-at-post path. Any later surface — notably the match page's
-- "Create Game" button — had nothing to read, so it had to guess from
-- visibility. That guess is wrong in both directions: it publishes public
-- lobbies whose host never asked for Karabast, and (before 69b632b7) it made
-- private Karabast lobbies for hosts who did.
--
-- Defaults FALSE so every existing row keeps the safer behaviour: a lobby is
-- only published to Karabast if its host explicitly asked for it.
ALTER TABLE open_games ADD COLUMN IF NOT EXISTS karabast_findable BOOLEAN NOT NULL DEFAULT FALSE;

-- A private lobby is link-only, so publishing it to a public list contradicts
-- the choice the host just made. Enforced in the schema, not only in the
-- service, so no future code path can persist the contradiction.
-- Existing rows all satisfy this: karabast_findable defaults FALSE, and
-- "NOT FALSE" is TRUE regardless of visibility.
ALTER TABLE open_games DROP CONSTRAINT IF EXISTS open_games_karabast_findable_check;
ALTER TABLE open_games ADD CONSTRAINT open_games_karabast_findable_check
  CHECK (NOT karabast_findable OR visibility = 'public');
