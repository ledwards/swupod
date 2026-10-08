-- Migration 011: Add pause functionality for drafts

-- Add paused flag to track if draft is currently paused
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS paused BOOLEAN DEFAULT false;

-- Add paused_at timestamp to track when the draft was paused
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- Add paused_duration to accumulate total paused time in seconds
-- This is used to adjust timeout calculations
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS paused_duration_seconds INTEGER DEFAULT 0;
