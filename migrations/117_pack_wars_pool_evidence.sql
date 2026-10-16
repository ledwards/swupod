-- Pack Wars and Pack Blitz pools record the same immutable evidence as generated
-- sealed pools, written in one transaction with the pool (app/api/formats/pack-*).
-- Pools opened before this are not backfilled; table play refuses them by name.
-- Idempotent: replace whatever pool_type CHECK exists (097 declared it inline, so
-- its name is Postgres's default) with one that also allows the pack formats.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'ptp_native_pool_evidence'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%pool_type%'
  LOOP
    EXECUTE format('ALTER TABLE ptp_native_pool_evidence DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE ptp_native_pool_evidence ADD CONSTRAINT ptp_native_pool_evidence_pool_type_check
  CHECK (pool_type IN ('sealed', 'pack_wars', 'pack_blitz'));
