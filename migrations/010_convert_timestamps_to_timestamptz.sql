-- Migration 010: Convert all timestamp columns to timestamptz
-- This ensures consistent timezone handling across all timestamps

ALTER TABLE card_pools ALTER COLUMN created_at TYPE TIMESTAMPTZ;
ALTER TABLE card_pools ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
ALTER TABLE draft_pod_players ALTER COLUMN joined_at TYPE TIMESTAMPTZ;
ALTER TABLE draft_pod_players ALTER COLUMN last_heartbeat TYPE TIMESTAMPTZ;
ALTER TABLE draft_pod_players ALTER COLUMN last_pick_at TYPE TIMESTAMPTZ;
ALTER TABLE draft_pods ALTER COLUMN completed_at TYPE TIMESTAMPTZ;
ALTER TABLE draft_pods ALTER COLUMN created_at TYPE TIMESTAMPTZ;
ALTER TABLE draft_pods ALTER COLUMN started_at TYPE TIMESTAMPTZ;
ALTER TABLE draft_pods ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN created_at TYPE TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
