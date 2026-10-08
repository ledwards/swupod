-- Add columns for booster box simulation
-- box_packs: Full 24 packs of the booster box
-- pack_indices: Which packs from the box are currently displayed (e.g., [0,1,2,3,4,5])
-- shuffled_packs: Whether the user has randomized their packs

ALTER TABLE card_pools ADD COLUMN IF NOT EXISTS box_packs JSONB;
ALTER TABLE card_pools ADD COLUMN IF NOT EXISTS pack_indices INTEGER[];
ALTER TABLE card_pools ADD COLUMN IF NOT EXISTS shuffled_packs BOOLEAN DEFAULT false;
