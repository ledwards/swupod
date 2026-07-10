# Collation Benchmark — ASH, 300 boxes (1200 pools)

Generated: consumer-order stats from `generateSealedBox`. Targets from real data
(box 001, pool 002, LAW event fixtures) — see plans/LINE_STACKING_COLLATION_PLAN.md.

| # | Target (real data) | Measured |
|---|---|---|
| M1 | Normal+Normal pairs/pool — real pools: 0,0,3,7 (box 001) and 10 (pool 002); band: mean 1.0-4.0, max ≥5 | mean 1.16, max 5, pools≥5: 0.5% |
| M2 | Dup identities/pool mean — 12 verified full pools mean ≈6.4 (prague-taylor-b excluded: unverified); band 5.5-8.0 | mean 6.66 ± 1.84 |
| M3 | % pools ≥10 dup identities — verified 3/12 ≈25% (all box-cut); knobless model runs ~9%, band 3-45% pending 6-box calibration | 5.8% of pools ≥10 |
| M4 | Box unique identities — real 183; band 178-188 | mean 182.8 ± 2.5 |
| M5 | Within-pack dup groups/pack — real 4/30 ≈0.13, all cross-variant; band 0.10-0.20, ≥90% cross-variant | 0.157/pack, cross-variant 99.8% |
| M6 | Base same-aspect adjacency (consumer) — real 5/21 ≈ random 25%; band 15-35% | 28.2% adjacent same-aspect |
| M7 | Leader same-name repeat min gap (consumer) — real min 2; target ≤4 | leader min repeat gap 1 |
| M8 | Rare-slot same-name repeat min gap (consumer) — real min 2; target ≤4 | rare min repeat gap 1 |
| M9 | Slot rates: HS leader ≈1/6, HS base ≈1/6, HS common =1/pack, UC1/UC2 HS =0, foil always HSF, R:L ≈5:1 | HS leader 0.161, HS base 0.166, HS common=1 95.7%, packs w/ 2+ HS UC 0.00%, non-HSF foils 0, R:L 5.1:1 |
