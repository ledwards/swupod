-- Migration 012: Add bot processing lock to prevent concurrent bot processing

-- Add bot_processing_since timestamp to track when bot processing started
-- Used to prevent race conditions when multiple processes try to handle bot picks
-- NULL means no processing is happening, timestamp means processing is active
-- If timestamp is > 30 seconds old, the lock is considered stale and can be taken
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS bot_processing_since TIMESTAMPTZ;
