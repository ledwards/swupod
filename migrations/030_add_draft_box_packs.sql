-- Add box_packs to draft_pods for booster box simulation
-- box_packs: Full 24 packs of the booster box, generated when draft is created
-- shuffled_packs: Whether the host has randomized the packs

ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS box_packs JSONB;
ALTER TABLE draft_pods ADD COLUMN IF NOT EXISTS shuffled_packs BOOLEAN DEFAULT false;
