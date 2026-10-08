CREATE TABLE IF NOT EXISTS ptp_solo_ai_participants (
 run_id UUID NOT NULL REFERENCES ptp_solo_ai_runs(id), id TEXT NOT NULL, seat INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('human','ai')), name TEXT NOT NULL, deck JSONB NOT NULL,
 PRIMARY KEY(run_id,id), UNIQUE(run_id,seat)
);
CREATE TABLE IF NOT EXISTS ptp_solo_ai_matches (
 id UUID PRIMARY KEY, run_id UUID NOT NULL REFERENCES ptp_solo_ai_runs(id),
 round INTEGER NOT NULL CHECK(round BETWEEN 1 AND 3), ordinal INTEGER NOT NULL,
 player1 TEXT NOT NULL, player2 TEXT NOT NULL, winner TEXT,
 UNIQUE(run_id,round,ordinal), UNIQUE(id,run_id), CHECK(player1<>player2),
 CHECK(winner IS NULL OR winner IN (player1,player2)),
 FOREIGN KEY(run_id,player1) REFERENCES ptp_solo_ai_participants(run_id,id),
 FOREIGN KEY(run_id,player2) REFERENCES ptp_solo_ai_participants(run_id,id)
);
CREATE TABLE IF NOT EXISTS ptp_solo_ai_games (
 id UUID PRIMARY KEY, run_id UUID NOT NULL, match_id UUID NOT NULL,
 game_no INTEGER NOT NULL CHECK(game_no>0), requested BOOLEAN NOT NULL DEFAULT false,
 result TEXT CHECK(result IN ('player1','player2','draw')),
 record_json JSONB, record_hash TEXT, error TEXT,
 next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(match_id,run_id) REFERENCES ptp_solo_ai_matches(id,run_id),
 UNIQUE(match_id,game_no),
 CHECK((result IS NULL AND record_json IS NULL AND record_hash IS NULL) OR (result IS NOT NULL AND record_json IS NOT NULL AND record_hash ~ '^[a-f0-9]{64}$'))
);
CREATE INDEX IF NOT EXISTS solo_ai_pending ON ptp_solo_ai_games(next_check_at) WHERE result IS NULL AND requested=true;
DROP TRIGGER IF EXISTS solo_ai_participant_immutable ON ptp_solo_ai_participants;
CREATE TRIGGER solo_ai_participant_immutable BEFORE UPDATE ON ptp_solo_ai_participants
FOR EACH ROW EXECUTE FUNCTION reject_native_deck_version_update();
CREATE OR REPLACE FUNCTION protect_solo_ai_game() RETURNS TRIGGER AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.run_id IS DISTINCT FROM OLD.run_id OR NEW.match_id IS DISTINCT FROM OLD.match_id
 OR NEW.game_no IS DISTINCT FROM OLD.game_no OR NEW.created_at IS DISTINCT FROM OLD.created_at
 OR (OLD.requested AND NOT NEW.requested)
 OR (OLD.result IS NOT NULL AND (NEW.result IS DISTINCT FROM OLD.result OR NEW.record_json IS DISTINCT FROM OLD.record_json OR NEW.record_hash IS DISTINCT FROM OLD.record_hash)) THEN
 RAISE EXCEPTION 'Solo game identity and completed records are immutable'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS solo_ai_game_immutable ON ptp_solo_ai_games;
CREATE TRIGGER solo_ai_game_immutable BEFORE UPDATE ON ptp_solo_ai_games
FOR EACH ROW EXECUTE FUNCTION protect_solo_ai_game();
