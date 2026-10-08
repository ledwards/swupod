-- Store the Wayfinder replay URL on practice matches so PTP players can
-- jump directly to the game replay after a match is recorded.
ALTER TABLE practice_matches
  ADD COLUMN IF NOT EXISTS wayfinder_replay_url TEXT;
