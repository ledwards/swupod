-- Bo1 vs Bo3 (host's choice, toggleable on the lobby page while the listing
-- is open). Informational for the players + passed to the Companion so the
-- Karabast lobby can be created to match.
ALTER TABLE open_games ADD COLUMN IF NOT EXISTS best_of INTEGER NOT NULL DEFAULT 1;
ALTER TABLE open_games DROP CONSTRAINT IF EXISTS open_games_best_of_check;
ALTER TABLE open_games ADD CONSTRAINT open_games_best_of_check CHECK (best_of IN (1, 3));
