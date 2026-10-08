-- Migration 008: Add pick_started_at to track when current pick round began

ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS pick_started_at TIMESTAMPTZ;
