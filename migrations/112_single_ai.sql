-- Admit the single upgraded AI while retaining saved policies.
CREATE OR REPLACE FUNCTION protect_solo_ai_run() RETURNS TRIGGER AS $$
DECLARE
  style_change BOOLEAN;
BEGIN
  style_change := OLD.prepared->'singleGame' = 'true'::jsonb
    AND (NEW.prepared - 'aiPolicy') = (OLD.prepared - 'aiPolicy')
    AND NEW.prepared->>'aiPolicy' IN ('cal-aggro-v1','cal-balanced-v1','cal-control-v1',
      'cal-aggro-v2','cal-balanced-v2','cal-control-v2','policy-champion-v3')
    AND NOT EXISTS (SELECT 1 FROM ptp_solo_ai_games WHERE run_id=OLD.id AND requested);
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.pool_share_id IS DISTINCT FROM OLD.pool_share_id
    OR (NEW.prepared IS DISTINCT FROM OLD.prepared AND NOT COALESCE(style_change,false))
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.opponent_deck IS NOT NULL AND NEW.opponent_deck IS DISTINCT FROM OLD.opponent_deck) THEN
    RAISE EXCEPTION 'Solo preparation and completed bot decks are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
