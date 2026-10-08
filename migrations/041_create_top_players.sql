-- Migration 041: Create top_players table
-- Curated list of top competitive players whose stats are shown
-- in the "Top" section of the stats page (patron-gated).
-- Players are identified by Discord username; user_id is resolved
-- from the users table when the player has used the app.

CREATE TABLE IF NOT EXISTS top_players (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index on user_id for efficient JOIN in stats queries
-- (e.g. JOIN top_players tp ON tp.user_id = dp.user_id)
CREATE INDEX IF NOT EXISTS idx_top_players_user_id
ON top_players(user_id) WHERE user_id IS NOT NULL;

-- Data is managed via direct SQL, not migrations.
-- To add players: INSERT INTO top_players (username) VALUES ('discord_name') ON CONFLICT DO NOTHING;
-- Then resolve: UPDATE top_players tp SET user_id = u.id FROM users u WHERE LOWER(tp.username) = LOWER(u.username) AND tp.user_id IS NULL;
