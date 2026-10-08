-- Persist a bot's draft-time lane plan so deck building can reuse it exactly.
ALTER TABLE pod_players
  ADD COLUMN IF NOT EXISTS committed_leader JSONB;

ALTER TABLE pod_players
  ADD COLUMN IF NOT EXISTS committed_base_color TEXT;
