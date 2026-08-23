-- Revert the "Leebo is a locked BUILT-IN" experiment.
--
-- A previous migration (084, never deployed) taught voice_pack_entitlements to point
-- at either a creator pack (pack_id) or a built-in slug (builtin_pack_id), so that
-- Leebo — who shipped as static files — could be unlocked with a code. That premise
-- is gone: Leebo is now an ORDINARY CREATOR PACK, the first one, published by Protect
-- the Pod and seeded by 086. A creator pack is a voice_packs row like any other, so
-- the polymorphic entitlement has nothing left to model.
--
-- The reserved-code CHECK from 084 must go too, and urgently: it forbade the literal
-- code 'LEEBO', which is exactly the code 086 is about to insert.
--
-- SAFE ON BOTH DATABASES, which are NOT at the same point:
--   production applied 080 and 081 only — it never saw 084, so every statement here
--     is a no-op (the DROPs are IF EXISTS; pack_id is already NOT NULL);
--   development applied 084 — so here the column, the CHECK, the partial index and
--     the reserved-code CHECK all really exist and really get dropped.
--
-- The DELETE only ever matches rows 084 made possible (pack_id NULL, built-in
-- unlocks). They cannot be preserved: the thing they granted is not a pack row, and
-- anyone holding one simply redeems LEEBO again against the real pack. On production
-- the predicate cannot match anything — the column is NOT NULL there.

DELETE FROM voice_pack_entitlements WHERE pack_id IS NULL;

ALTER TABLE voice_packs
  DROP CONSTRAINT IF EXISTS voice_packs_code_not_reserved;

DROP INDEX IF EXISTS idx_voice_pack_entitlements_user_builtin;

ALTER TABLE voice_pack_entitlements
  DROP CONSTRAINT IF EXISTS voice_pack_entitlements_one_pack_check;

ALTER TABLE voice_pack_entitlements
  DROP COLUMN IF EXISTS builtin_pack_id;

-- Back to what 080 declared: an entitlement always names a voice_packs row.
ALTER TABLE voice_pack_entitlements
  ALTER COLUMN pack_id SET NOT NULL;
