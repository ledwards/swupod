# Collation Benchmark — ASH, 300 boxes (1200 pools)

Generated: consumer-order stats from `generateSealedBox`. Targets from real data
(box 001, pool 002, LAW event fixtures) — see plans/LINE_STACKING_COLLATION_PLAN.md.

| # | Target (real data) | Measured |
|---|---|---|
| M1 | Normal+Normal pairs/pool — 6-box refit (even-share 4.2%): mean ~0.6, band 0.25-2.0 (real pools mean 1.38 — accepted trade-off for tighter tail) | mean 0.58, max 4, pools≥5: 0.0% |
| M2 | Dup identities/pool mean — 12 verified full pools mean ≈6.4 (prague-taylor-b excluded: unverified); band 5.5-8.0 | mean 6.22 ± 1.84 |
| M3 | % pools ≥10 dup identities — 11-box observed 2/39 ≈5% (both in outlier box-001); 6-box pair-gap refit targets ~4%, band 1-10% | 4.7% of pools ≥10 |
| M4 | Box unique identities — real 183; band 178-188 | mean 182.8 ± 2.9 |
| M5 | Within-pack dup groups/pack — real 4/30 ≈0.13, all cross-variant; band 0.10-0.20, ≥90% cross-variant | 0.159/pack, cross-variant 99.7% |
| M6 | Base same-aspect adjacency (consumer) — real 5/21 ≈ random 25%; band 15-35% | 29.1% adjacent same-aspect |
| M7 | Leader same-name repeat min gap (consumer) — real min 2; target ≤4 | leader min repeat gap 1 |
| M8 | Rare-slot same-name repeat min gap (consumer) — real min 2; target ≤4 | rare min repeat gap 1 |
| M9 | Slot rates: HS leader ≈1/6, HS base ≈1/6, HS common =1/pack, UC1/UC2 HS =0, foil always HSF, R:L ≈5:1 | HS leader 0.164, HS base 0.169, HS common=1 95.8%, packs w/ 2+ HS UC 0.00%, non-HSF foils 0, R:L 5.2:1 |
