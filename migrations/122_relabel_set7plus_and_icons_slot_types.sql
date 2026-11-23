-- Migration 122: relabel card_generations.slot_type for Set 7+ and Icons packs
--
-- Until 2026-11-23, every pack was labelled with the Sets 1-6 position map
-- (src/utils/packSlotTypes.ts PACK_SLOT_TYPES). Two layouts differ:
--
--   Set 7+ (LAW, ASH, HMW) standard boosters print 11 = hyperspace foil,
--   12-14 = uncommons, 15 = rare/legendary. The old map called 11 'uncommon',
--   14 'rare_legendary' and 15 'foil'. So in an old-labelled pack:
--     the non-foil card labelled 'foil'          is the R/L        -> 'rare_legendary'
--     the card labelled 'rare_legendary'         is UC3            -> 'uncommon'
--     the foil card labelled 'uncommon'          is the HS foil    -> 'foil'
--   A pack is old-labelled exactly when it holds a NON-foil card labelled
--   'foil' — under the correct map the 'foil' slot is always the hyperspace
--   foil. That test needs no timestamps, so rows written after the fix are never
--   touched and re-running this is a no-op. Carbonite packs keep the 16-card map
--   (their slot 15 is a hyperspace foil, so they never match) and are left alone.
--
--   Icons (IC27) prints 9 cards with no leader or base slot (ICONS_PACK_SLOT_TYPES).
--   Old-labelled Icons packs read leader, base, common x7. Rows are inserted in
--   pack order, so position comes from id order within the pack; a pack is only
--   relabelled when it has exactly that old shape and its 9th card is the
--   hyperspace foil. Icons packs from before 9-card printing (16 cards) are left
--   as they are.
--
-- Rows without a pack_index cannot be placed in a pack and are left alone.
-- Finally, the stored QA aggregates for these sets are marked stale so the next
-- visit serves them once and recomputes in the background (lib/statCache.ts).

WITH old_packs AS (
  SELECT source_type, source_id, pack_index
  FROM card_generations
  WHERE pack_type = 'booster'
    AND set_code IN ('LAW', 'ASH', 'HMW')
    AND pack_index IS NOT NULL
  GROUP BY source_type, source_id, pack_index
  HAVING count(*) = 16
     AND count(*) FILTER (WHERE slot_type = 'foil') = 1
     AND count(*) FILTER (WHERE slot_type = 'foil' AND NOT is_foil) = 1
     AND count(*) FILTER (WHERE slot_type = 'rare_legendary') = 1
     AND count(*) FILTER (WHERE slot_type = 'uncommon' AND is_foil) = 1
)
UPDATE card_generations cg
SET slot_type = CASE
    WHEN cg.slot_type = 'foil' THEN 'rare_legendary'
    WHEN cg.slot_type = 'rare_legendary' THEN 'uncommon'
    ELSE 'foil'
  END
FROM old_packs o
WHERE cg.pack_type = 'booster'
  AND cg.set_code IN ('LAW', 'ASH', 'HMW')
  AND cg.source_type = o.source_type
  AND cg.source_id = o.source_id
  AND cg.pack_index = o.pack_index
  AND (cg.slot_type IN ('foil', 'rare_legendary') OR (cg.slot_type = 'uncommon' AND cg.is_foil));

WITH icons AS (
  SELECT id, source_type, source_id, pack_index, slot_type, card_type, is_foil,
    row_number() OVER w AS pos,
    count(*) OVER w AS n
  FROM card_generations
  WHERE pack_type = 'booster' AND set_code = 'IC27' AND pack_index IS NOT NULL
  WINDOW w AS (PARTITION BY source_type, source_id, pack_index ORDER BY id
               ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
), old_icons_packs AS (
  SELECT source_type, source_id, pack_index
  FROM icons
  WHERE n = 9
  GROUP BY source_type, source_id, pack_index
  HAVING bool_and(CASE pos WHEN 1 THEN slot_type = 'leader'
                           WHEN 2 THEN slot_type = 'base'
                           ELSE slot_type = 'common' END)
     AND bool_and((pos = 9) = is_foil)
)
UPDATE card_generations cg
SET slot_type = CASE i.pos
    WHEN 4 THEN CASE WHEN i.card_type = 'Leader' THEN 'leader' ELSE 'common' END
    WHEN 6 THEN 'uncommon'
    WHEN 7 THEN 'uncommon'
    WHEN 8 THEN 'rare_legendary'
    WHEN 9 THEN 'foil'
    ELSE 'common'
  END
FROM icons i
JOIN old_icons_packs p
  ON p.source_type = i.source_type AND p.source_id = i.source_id AND p.pack_index = i.pack_index
WHERE cg.id = i.id;

UPDATE stat_cache
SET computed_at = 'epoch'
WHERE key ~ '^(pack-quality|generations):(LAW|ASH|HMW|IC27):';
