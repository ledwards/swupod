-- Migration 123: relabel card_generations.slot_type for Carbonite packs
--
-- Carbonite packs (JTL/LOF/SEC/LAW/ASH -CB) were tracked with the standard 16-card
-- map: their prestige or first foil was called the 'base', an HSF common the
-- 'rare_legendary', and so on. They now carry their own 'carbonite_*' labels
-- (src/utils/packSlotTypes.ts), and the stats leave those rows out.
--
-- A tracked row does not record that its pack was Carbonite (cards carry the base
-- set code), so the pack is recognised from what it holds: 16 cards, no base, one
-- prestige. Where that prestige sits says which layout printed the pack:
--   index 8 -> pre-LAW layout (JTL, LOF, SEC)
--   index 1 -> LAW layout (LAW, and ASH before its calibrated layout shipped 2026-07-10)
--   index 9 -> ASH layout
-- Standard LAW+ packs can hold a prestige too (UC3 upgrade), but always with a base,
-- so they never match. Position within a pack is id order (one bulk insert per pool).
--
-- Plan: packs are found through the variant_type index, copied into an analysed temp
-- table, and the rows are updated by primary key. Idempotent: labels come only from
-- position, so a re-run writes nothing.

CREATE TEMP TABLE cb_packs ON COMMIT DROP AS
SELECT DISTINCT source_type, source_id, pack_index
FROM card_generations
-- 'Prestige' is the older spelling, still on about 3,700 tracked rows.
WHERE variant_type IN ('Prestige', 'Standard Prestige', 'Foil Prestige', 'Serialized Prestige')
  AND pack_type = 'booster'
  AND pack_index IS NOT NULL
  AND set_code IN ('JTL', 'LOF', 'SEC', 'LAW', 'ASH');

ANALYZE cb_packs;

CREATE TEMP TABLE cb_rows ON COMMIT DROP AS
WITH positioned AS (
  SELECT cg.id, cg.set_code, cg.card_type, cg.variant_type,
         cg.source_type, cg.source_id, cg.pack_index,
         row_number() OVER (PARTITION BY cg.source_type, cg.source_id, cg.pack_index ORDER BY cg.id) - 1 AS pos
  FROM card_generations cg
  JOIN cb_packs USING (source_type, source_id, pack_index)
  WHERE cg.pack_type = 'booster'
),
packs AS (
  SELECT source_type, source_id, pack_index,
         min(set_code) AS set_code,
         count(*) AS n,
         count(DISTINCT set_code) AS sets,
         count(*) FILTER (WHERE card_type = 'Base') AS bases,
         count(*) FILTER (WHERE variant_type LIKE '%Prestige') AS prestiges,
         min(pos) FILTER (WHERE variant_type LIKE '%Prestige') AS prestige_pos
  FROM positioned
  GROUP BY source_type, source_id, pack_index
),
layouts AS (
  SELECT source_type, source_id, pack_index,
         CASE
           WHEN prestige_pos = 8 AND set_code IN ('JTL', 'LOF', 'SEC') THEN ARRAY[
             'carbonite_leader',
             'carbonite_foil_common', 'carbonite_foil_common', 'carbonite_foil_common', 'carbonite_foil_common',
             'carbonite_foil_uncommon', 'carbonite_foil_uncommon', 'carbonite_foil_rare_legendary',
             'carbonite_prestige',
             'carbonite_hs_common', 'carbonite_hs_common', 'carbonite_hs_common',
             'carbonite_hs_uncommon', 'carbonite_hs_rare_legendary',
             'carbonite_hsf', 'carbonite_hsf']
           WHEN prestige_pos = 1 AND set_code IN ('LAW', 'ASH') THEN ARRAY[
             'carbonite_leader', 'carbonite_prestige',
             'carbonite_hs_common', 'carbonite_hs_common', 'carbonite_hs_common', 'carbonite_hs_common',
             'carbonite_hs_flex', 'carbonite_hs_flex', 'carbonite_hs_flex', 'carbonite_hs_top',
             'carbonite_hsf_flex', 'carbonite_hsf_flex', 'carbonite_hsf_flex', 'carbonite_hsf_flex',
             'carbonite_hsf_common', 'carbonite_hsf_common']
           WHEN prestige_pos = 9 AND set_code = 'ASH' THEN ARRAY[
             'carbonite_leader',
             'carbonite_hs', 'carbonite_hs', 'carbonite_hs', 'carbonite_hs', 'carbonite_hs', 'carbonite_hs', 'carbonite_hs',
             'carbonite_hs_top', 'carbonite_prestige', 'carbonite_hsf_top',
             'carbonite_hsf', 'carbonite_hsf', 'carbonite_hsf', 'carbonite_hsf', 'carbonite_hsf']
         END AS labels
  FROM packs
  WHERE n = 16 AND sets = 1 AND bases = 0 AND prestiges = 1
)
SELECT p.id, l.labels[p.pos + 1] AS label
FROM positioned p
JOIN layouts l USING (source_type, source_id, pack_index)
WHERE l.labels IS NOT NULL;

ANALYZE cb_rows;

UPDATE card_generations cg
SET slot_type = cb_rows.label
FROM cb_rows
WHERE cg.id = cb_rows.id
  AND cg.slot_type IS DISTINCT FROM cb_rows.label;

-- The stored stats for these sets counted Carbonite rows; recompute on next read.
UPDATE stat_cache
SET computed_at = 'epoch'
WHERE key ~ '^(pack-quality|generations):(JTL|LOF|SEC|LAW|ASH):';
