-- migrations/050_add_report_public_to_pools.sql
ALTER TABLE card_pools ADD COLUMN IF NOT EXISTS report_public BOOLEAN DEFAULT false;
