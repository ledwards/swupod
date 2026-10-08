-- Keep immutable preparation and previous games intact when practice becomes BO3.
ALTER TABLE ptp_solo_ai_runs ADD COLUMN IF NOT EXISTS best_of_three BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ptp_solo_ai_games ADD COLUMN IF NOT EXISTS deck_snapshots JSONB;

-- Existing requested games used participant decks; preserve those before sideboarding.
UPDATE ptp_solo_ai_games g SET deck_snapshots=jsonb_build_array(p1.deck,p2.deck)
FROM ptp_solo_ai_matches m, ptp_solo_ai_participants p1, ptp_solo_ai_participants p2
WHERE g.match_id=m.id AND p1.run_id=g.run_id AND p1.id=m.player1
  AND p2.run_id=g.run_id AND p2.id=m.player2 AND g.requested AND g.deck_snapshots IS NULL;

CREATE OR REPLACE FUNCTION protect_solo_game_decks() RETURNS TRIGGER AS $$
BEGIN
 IF OLD.deck_snapshots IS NOT NULL AND NEW.deck_snapshots IS DISTINCT FROM OLD.deck_snapshots THEN
   RAISE EXCEPTION 'Game deck snapshots are immutable';
 END IF;
 IF NEW.requested AND (NEW.deck_snapshots IS NULL OR jsonb_typeof(NEW.deck_snapshots) <> 'array'
   OR jsonb_array_length(NEW.deck_snapshots) <> 2) THEN
   RAISE EXCEPTION 'Requested games require two deck snapshots';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS solo_game_decks_immutable ON ptp_solo_ai_games;
CREATE TRIGGER solo_game_decks_immutable BEFORE INSERT OR UPDATE ON ptp_solo_ai_games
FOR EACH ROW EXECUTE FUNCTION protect_solo_game_decks();
