-- Add Discord LFG integration columns to pods table
-- Stores Discord message/thread/webhook IDs for pod chat and LFG posting
ALTER TABLE pods ADD COLUMN IF NOT EXISTS discord_message_id TEXT;
ALTER TABLE pods ADD COLUMN IF NOT EXISTS discord_thread_id TEXT;
ALTER TABLE pods ADD COLUMN IF NOT EXISTS discord_webhook_id TEXT;
ALTER TABLE pods ADD COLUMN IF NOT EXISTS discord_webhook_token TEXT;
