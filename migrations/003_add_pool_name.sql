-- Migration 003: Add name column to card_pools table

-- Add name column
ALTER TABLE card_pools 
ADD COLUMN IF NOT EXISTS name TEXT;

-- Generate default names for existing pools based on created_at, set_code, pool_type, and share_id
UPDATE card_pools 
SET name = TO_CHAR(created_at, 'MM/DD') || ' ' || 
           COALESCE(set_code, '') || ' ' ||
           CASE WHEN pool_type = 'draft' THEN 'Draft' ELSE 'Sealed' END || 
           ' (' || share_id || ')'
WHERE name IS NULL;
