-- Private solo runs own bot participants; no synthetic user accounts or public pools.
CREATE TABLE IF NOT EXISTS ptp_solo_ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id),
  request_id UUID NOT NULL,
  pool_share_id TEXT NOT NULL,
  prepared JSONB NOT NULL CHECK (jsonb_typeof(prepared)='object'),
  opponent_deck JSONB CHECK (opponent_deck IS NULL OR jsonb_typeof(opponent_deck)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_user_id,request_id)
);
CREATE INDEX IF NOT EXISTS solo_ai_runs_owner ON ptp_solo_ai_runs(owner_user_id,created_at DESC);
CREATE OR REPLACE FUNCTION protect_solo_ai_run() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.pool_share_id IS DISTINCT FROM OLD.pool_share_id
    OR NEW.prepared IS DISTINCT FROM OLD.prepared OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.opponent_deck IS NOT NULL AND NEW.opponent_deck IS DISTINCT FROM OLD.opponent_deck) THEN
    RAISE EXCEPTION 'Solo preparation and completed bot decks are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS solo_ai_run_immutable ON ptp_solo_ai_runs;
CREATE TRIGGER solo_ai_run_immutable BEFORE UPDATE ON ptp_solo_ai_runs
FOR EACH ROW EXECUTE FUNCTION protect_solo_ai_run();
