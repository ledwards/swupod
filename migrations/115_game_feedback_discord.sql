-- Feedback remains saved even when Discord is unavailable.
ALTER TABLE ptp_game_notes ADD COLUMN IF NOT EXISTS discord_message_id TEXT;
ALTER TABLE ptp_game_notes ADD COLUMN IF NOT EXISTS discord_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS ptp_game_notes_discord_pending_idx ON ptp_game_notes(discord_retry_at) WHERE discord_message_id IS NULL;
