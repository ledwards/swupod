# Collation Benchmark — ASH, 300 boxes (1200 pools)

Generated: consumer-order stats from `generateSealedBox`. Targets from real data
(box 001, pool 002, LAW event fixtures) — see plans/LINE_STACKING_COLLATION_PLAN.md.

| # | Target (real data) | Measured |
|---|---|---|
| M1 | Normal+Normal pairs/pool — real pools: 0,0,3,7 (box 001) and 10 (pool 002); band: mean 1.0-4.0, max ≥5 | mean 2.28, max 10, pools≥5: 16.2% |
| M2 | Dup identities/pool mean — real 13 full pools mean ≈6.5; band 5.5-8.0 | mean 7.74 ± 2.40 |
| M3 | % pools ≥10 dup identities — real 4/13 ≈31%; band 10-45% | 22.2% of pools ≥10 |
| M4 | Box unique identities — real 183; band 178-188 | mean 182.7 ± 2.6 |
| M5 | Within-pack dup groups/pack — real 4/30 ≈0.13, all cross-variant; band 0.10-0.20, ≥90% cross-variant | 0.161/pack, cross-variant 99.6% |
| M6 | Base same-aspect adjacency (consumer) — real 5/21 ≈ random 25%; band 15-35% | 28.5% adjacent same-aspect |
| M7 | Leader same-name repeat min gap (consumer) — real min 2; target ≤4 | leader min repeat gap 1 |
| M8 | Rare-slot same-name repeat min gap (consumer) — real min 2; target ≤4 | rare min repeat gap 1 |
| M9 | Slot rates: HS leader ≈1/6, HS base ≈1/6, HS common =1/pack, UC1/UC2 HS =0, foil always HSF, R:L ≈5:1 | HS leader 0.163, HS base 0.171, HS common=1 96.1%, packs w/ 2+ HS UC 0.00%, non-HSF foils 0, R:L 5.1:1 |
