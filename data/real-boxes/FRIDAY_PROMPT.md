# Prompt for the 6-Box Analysis Session

Paste the block below into a fresh Claude session when the box photos are ready.
Fill in the folder paths.

---

I have 6 real ASH booster boxes photographed per data/real-boxes/COLLECTION_GUIDE.md
(read it first, plus data/real-boxes/README.md). Photo folders, one per box, in order:
[PASTE FOLDER PATHS HERE — note which box number each folder is]

Photos are one-per-pack in box-consumption order (left column top→bottom, then right
column), 16 cards per photo laid out in pull order. Your job: transcribe, verify,
analyze, and recalibrate the collation model per the Phase 4 decision rules in
plans/LINE_STACKING_COLLATION_PLAN.md. Full evidence history:
plans/ASH_COLLATION_FINDINGS.md. Reference dataset: data/real-boxes/ash-box-001.csv.

## Transcription pipeline (proven on box 001 — reuse it)
1. Convert HEIC → full-res JPEG (sips), then ImageMagick 62%-size overlapping
   quadrant crops (q1-q4) + a small overview per photo. Card titles and collector
   numbers are readable in quadrants, not in the full downscaled image.
2. Build a reference file from src/data/cards.json: ASH rows as
   number|name|subtitle|rarity|type|aspects|variantType.
3. Fan out transcription subagents (sonnet is fine), ~3 packs each. THE RULE THAT
   MATTERS: identify every card by the PRINTED collector number read off a full-res
   crop of the card's bottom line. Normal cards print "N/264"; variant printings
   print a BARE number with no denominator (265-528 hyperspace, 529-766 HS foil,
   767-784 showcase, 785-925 prestige tiers). Hyperspace cards are borderless.
   Never let an agent resolve a card by name-matching alone.
4. MANDATORY verification pass (opus): on box 001, half the first-pass agents
   silently mapped hyperspace cards to their normal numbers. Audit EVERY pack:
   re-crop and re-read every number line, confirm exactly 1 leader, 1 base,
   1 HS-foil in the foil slot, ~1 non-foil HS common at common slot 5. Also:
   standard-frame foils DO NOT EXIST in ASH — any "standard foil" read is an error.
5. Merge to data/real-boxes/ash-box-002.csv … ash-box-007.csv (schema in the
   README). Photos themselves never get committed.

## Analysis (in this order, per Phase 4)
1. Stacking verification PER BOX: under the factory-line theory, line order is box
   positions 12,24,11,23,10,22,…,1,13. Test it the way box 001 was confirmed:
   line-adjacent pack pairs share ~4x more card identities than random pairs, and
   bases become aspect-separated in line order. If any box contradicts the
   interleave, report it — the fix is only the stackBoxOrder permutation.
2. The duplicate-tail decision (the main event): compute dup identities per 6-pack
   pool (deck cards only, identity = name+subtitle, treatment-invariant) for all 24
   pools. Current shipped knobless model produces ~6% pools ≥10; box 001 + pool 002
   showed 3/5. Decision rule: changepoint-shaped duplication or cross-belt
   co-location → implement the physical stacker-slip/QC-drop mechanism; scattered
   loaded pools → recalibrate the pair-gap histogram in CommonBelt; loaded pools
   rare → shipped model stands, change nothing.
3. Per-box second-copy distance histograms in line order (gap PARITY is the
   load-bearing detail — odd gaps split across columns, even gaps stay together).
4. Rate confirmations vs shipped model: foil slot C72/U13/R8/S4/L3, prestige 1/12,
   HS leader 1/6, HS base 1/6, leader+base co-occurrence ~1/36 packs, UC3 outcome
   mix (1/3 upgrade, UC:R:S:L = 24:12:3:1), UC1/UC2 hyperspace must stay 0/box,
   showcase ~1/576, rare slot R:L 5:1, leader/rare/base repeat spacing.

## Working rules (non-negotiable)
- Tests and QA first: any generator change lands red-green (spec test citing the
  real-data source first, then code), rate-based assertions with bands (never
  hard ===0 over seeded samples), full `npm run test && npm run qa` green, and
  scripts/collation-benchmark.ts run before AND after with both reports committed.
  All 9 metrics must stay in band; regressions on already-matching metrics = do not ship.
- Set 7+ scoping only; sets 1-6 behavior byte-identical.
- Trust raw data over agent summaries — re-derive any load-bearing claim from the
  CSVs yourself. If data contradicts the docs, say so; don't force a fit.
- Cite evidence as pack + card + collector number.
- The working tree may contain unrelated in-flight changes: stage and commit ONLY
  your own files. Never `git push` without an explicit "push" from me — pushes
  deploy production.
- Update plans/ASH_COLLATION_FINDINGS.md as you go (it's the living record), and
  finish with: per-box CSVs committed, the Phase 4 decision made with numbers, and
  a summary of what changed vs what was confirmed.
