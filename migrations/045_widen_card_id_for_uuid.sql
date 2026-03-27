-- Migration 045: Widen card_id columns from VARCHAR(20) to TEXT for UUID support
-- UUIDs are 36 chars; old format was ~7 chars (e.g. "SOR-001").
-- Affects draft_picks and card_generations tables.

ALTER TABLE draft_picks ALTER COLUMN card_id TYPE TEXT;
ALTER TABLE card_generations ALTER COLUMN card_id TYPE TEXT;
