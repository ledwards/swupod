-- Add strategy_name and mixin_name to pod_players for bot strategy persistence.
-- NULL for human players. Populated when strategies are assigned to bots at draft start.
ALTER TABLE pod_players ADD COLUMN IF NOT EXISTS strategy_name TEXT;
ALTER TABLE pod_players ADD COLUMN IF NOT EXISTS mixin_name TEXT;
