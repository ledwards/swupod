-- Alpha is the smaller, explicitly granted testing cohort. No personal roster
-- belongs in migrations; grant membership by verified Discord ID separately.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_alpha_tester BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_is_alpha_tester ON users(is_alpha_tester) WHERE is_alpha_tester=TRUE;

-- Keep existing beta-only code compatible before the alpha application ships.
-- Revoking alpha leaves independently useful beta membership intact.
CREATE OR REPLACE FUNCTION sync_alpha_tester_access() RETURNS TRIGGER AS $$
BEGIN
 IF NEW.is_alpha_tester THEN NEW.is_beta_tester := TRUE; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.is_alpha_tester IS DISTINCT FROM OLD.is_alpha_tester THEN
   NEW.auth_version := GREATEST(NEW.auth_version,OLD.auth_version+1);
  END IF;
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS users_alpha_tester_access ON users;
CREATE TRIGGER users_alpha_tester_access BEFORE INSERT OR UPDATE OF is_alpha_tester,is_beta_tester ON users
 FOR EACH ROW EXECUTE FUNCTION sync_alpha_tester_access();
UPDATE users SET is_beta_tester=TRUE WHERE is_alpha_tester AND is_beta_tester IS DISTINCT FROM TRUE;
