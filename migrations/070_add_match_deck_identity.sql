-- 070_add_match_deck_identity.sql
-- Capture both players' deck identity (leader / base / archetype) on each
-- recorded match, so the personal stats history can show a real
-- "your leader vs opponent's leader" matchup instead of just an avatar.
--
-- Populated by the Wayfinder Companion via POST /api/plugin/v1/match/result
-- (see docs/WAYFINDER_PLUGIN_MATCH_IDENTITY.md). All nullable: pre-update
-- Companion builds simply leave them NULL and the UI falls back to the avatar.

ALTER TABLE practice_matches
  ADD COLUMN IF NOT EXISTS player1_leader TEXT,
  ADD COLUMN IF NOT EXISTS player1_leader_image TEXT,
  ADD COLUMN IF NOT EXISTS player1_base TEXT,
  ADD COLUMN IF NOT EXISTS player1_base_image TEXT,
  ADD COLUMN IF NOT EXISTS player1_archetype TEXT,
  ADD COLUMN IF NOT EXISTS player2_leader TEXT,
  ADD COLUMN IF NOT EXISTS player2_leader_image TEXT,
  ADD COLUMN IF NOT EXISTS player2_base TEXT,
  ADD COLUMN IF NOT EXISTS player2_base_image TEXT,
  ADD COLUMN IF NOT EXISTS player2_archetype TEXT;
