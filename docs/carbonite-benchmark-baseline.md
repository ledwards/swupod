# Carbonite Pack Benchmark

**20,000 packs/set** · sets: JTL-CB, LOF-CB, SEC-CB, LAW-CB, ASH-CB

Ground truth = design spec (`plans/CARBONITE_PACK_PLAN.md` + `src/utils/carboniteConstants.ts`).
Carbonite is app-only (Chaos Sealed/Draft) — no real-box data exists. Bands are spec-derived tolerances.

## JTL-CB (pre-LAW) — ⚠️ 2 band miss

| Check | Measured | Spec band | |
|---|---|---|---|
| Pack size always 16 | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Slot 0 is a leader | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Exactly 1 prestige/pack | 20000 valid / 20000 | = 20000 valid / 20000 | ✅ |
| No Normal-only cards | 0 | = 0 | ✅ |
| No wrong-set cards | 0 | = 0 | ✅ |
| No same-belt within-pack dups | 128 packs | = 0 packs | ❌ |
| No identical-printing dups (whole pack) | 128 packs | = 0 packs | ❌ |
| Leader always HS/Showcase | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Showcase rate (spec 5.00%) | 5.03% | 3.8–6.2% | ✅ |
| Prestige tier1 (spec 80%) | 79.95% | 77.0–83.0% | ✅ |
| Prestige tier2 (spec 18%) | 17.89% | 15.0–21.0% | ✅ |
| Prestige serialized (spec 2%) | 2.16% | 1.0–3.5% | ✅ |
| R/L Foil Rare (spec 70%) | 69.90% | 66.0–74.0% | ✅ |
| R/L Foil Special (spec 20%) | 20.08% | 16.5–23.5% | ✅ |
| R/L Foil Legendary (spec 10%) | 10.03% | 7.0–13.0% | ✅ |
| R/L HS Rare (spec 70%) | 69.93% | 66.0–74.0% | ✅ |
| R/L HS Special (spec 20%) | 20.04% | 16.5–23.5% | ✅ |
| R/L HS Legendary (spec 10%) | 10.03% | 7.0–13.0% | ✅ |
| R/L Foil only R/S/L | 0 | = 0 | ✅ |
| R/L HS only R/S/L | 0 | = 0 | ✅ |

- HSF-slot cards with true `variantType:'Hyperspace Foil'`: 100.0% (40000/40000)

<details><summary>Per-slot variant/rarity table</summary>

| Slot | Dominant rarity mix | Dominant variant tuple (variantType\|flags) |
|---|---|---|
| 0 | Common 85.7%, Rare 14.3% | Hyperspace|H 95.0% · Showcase|S 5.0% |
| 1 | Common 100.0% | Normal|F 100.0% |
| 2 | Common 100.0% | Normal|F 100.0% |
| 3 | Common 100.0% | Normal|F 100.0% |
| 4 | Common 100.0% | Normal|F 100.0% |
| 5 | Uncommon 100.0% | Normal|F 100.0% |
| 6 | Uncommon 100.0% | Normal|F 100.0% |
| 7 | Rare 69.9%, Special 20.1%, Legendary 10.0% | Normal|F 100.0% |
| 8 | Uncommon 36.1%, Legendary 27.8%, Rare 25.0%, Special 11.1% | Standard Prestige|P 80.0% · Foil Prestige|FP 17.9% |
| 9 | Common 100.0% | Hyperspace|H 100.0% |
| 10 | Common 100.0% | Hyperspace|H 100.0% |
| 11 | Common 100.0% | Hyperspace|H 100.0% |
| 12 | Uncommon 100.0% | Hyperspace|H 100.0% |
| 13 | Rare 69.9%, Special 20.0%, Legendary 10.0% | Hyperspace|H 100.0% |
| 14 | Common 73.2%, Uncommon 17.0%, Rare 4.2%, Special 3.8%, Legendary 1.9% | Hyperspace Foil|FH 100.0% |
| 15 | Common 73.5%, Uncommon 16.7%, Rare 4.2%, Special 3.6%, Legendary 1.9% | Hyperspace Foil|FH 100.0% |

</details>

## LOF-CB (pre-LAW) — ⚠️ 2 band miss

| Check | Measured | Spec band | |
|---|---|---|---|
| Pack size always 16 | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Slot 0 is a leader | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Exactly 1 prestige/pack | 20000 valid / 20000 | = 20000 valid / 20000 | ✅ |
| No Normal-only cards | 0 | = 0 | ✅ |
| No wrong-set cards | 0 | = 0 | ✅ |
| No same-belt within-pack dups | 104 packs | = 0 packs | ❌ |
| No identical-printing dups (whole pack) | 104 packs | = 0 packs | ❌ |
| Leader always HS/Showcase | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Showcase rate (spec 5.00%) | 4.74% | 3.8–6.2% | ✅ |
| Prestige tier1 (spec 80%) | 79.58% | 77.0–83.0% | ✅ |
| Prestige tier2 (spec 18%) | 18.22% | 15.0–21.0% | ✅ |
| Prestige serialized (spec 2%) | 2.20% | 1.0–3.5% | ✅ |
| R/L Foil Rare (spec 70%) | 69.64% | 66.0–74.0% | ✅ |
| R/L Foil Special (spec 20%) | 20.27% | 16.5–23.5% | ✅ |
| R/L Foil Legendary (spec 10%) | 10.10% | 7.0–13.0% | ✅ |
| R/L HS Rare (spec 70%) | 69.72% | 66.0–74.0% | ✅ |
| R/L HS Special (spec 20%) | 20.23% | 16.5–23.5% | ✅ |
| R/L HS Legendary (spec 10%) | 10.06% | 7.0–13.0% | ✅ |
| R/L Foil only R/S/L | 0 | = 0 | ✅ |
| R/L HS only R/S/L | 0 | = 0 | ✅ |

- HSF-slot cards with true `variantType:'Hyperspace Foil'`: 100.0% (40000/40000)

<details><summary>Per-slot variant/rarity table</summary>

| Slot | Dominant rarity mix | Dominant variant tuple (variantType\|flags) |
|---|---|---|
| 0 | Common 85.7%, Rare 14.3% | Hyperspace|H 95.3% · Showcase|S 4.7% |
| 1 | Common 100.0% | Normal|F 100.0% |
| 2 | Common 100.0% | Normal|F 100.0% |
| 3 | Common 100.0% | Normal|F 100.0% |
| 4 | Common 100.0% | Normal|F 100.0% |
| 5 | Uncommon 100.0% | Normal|F 100.0% |
| 6 | Uncommon 100.0% | Normal|F 100.0% |
| 7 | Rare 69.6%, Special 20.3%, Legendary 10.1% | Normal|F 100.0% |
| 8 | Uncommon 43.5%, Legendary 28.3%, Rare 23.9%, Special 4.3% | Standard Prestige|P 79.6% · Foil Prestige|FP 18.2% |
| 9 | Common 100.0% | Hyperspace|H 100.0% |
| 10 | Common 100.0% | Hyperspace|H 100.0% |
| 11 | Common 100.0% | Hyperspace|H 100.0% |
| 12 | Uncommon 100.0% | Hyperspace|H 100.0% |
| 13 | Rare 69.7%, Special 20.2%, Legendary 10.1% | Hyperspace|H 100.0% |
| 14 | Common 73.7%, Uncommon 16.6%, Rare 4.3%, Special 3.7%, Legendary 1.8% | Hyperspace Foil|FH 100.0% |
| 15 | Common 73.7%, Uncommon 16.6%, Rare 4.2%, Special 3.7%, Legendary 1.9% | Hyperspace Foil|FH 100.0% |

</details>

## SEC-CB (pre-LAW) — ⚠️ 2 band miss

| Check | Measured | Spec band | |
|---|---|---|---|
| Pack size always 16 | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Slot 0 is a leader | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Exactly 1 prestige/pack | 20000 valid / 20000 | = 20000 valid / 20000 | ✅ |
| No Normal-only cards | 0 | = 0 | ✅ |
| No wrong-set cards | 0 | = 0 | ✅ |
| No same-belt within-pack dups | 117 packs | = 0 packs | ❌ |
| No identical-printing dups (whole pack) | 117 packs | = 0 packs | ❌ |
| Leader always HS/Showcase | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Showcase rate (spec 5.00%) | 4.92% | 3.8–6.2% | ✅ |
| Prestige tier1 (spec 80%) | 79.72% | 77.0–83.0% | ✅ |
| Prestige tier2 (spec 18%) | 18.36% | 15.0–21.0% | ✅ |
| Prestige serialized (spec 2%) | 1.93% | 1.0–3.5% | ✅ |
| R/L Foil Rare (spec 70%) | 70.00% | 66.0–74.0% | ✅ |
| R/L Foil Special (spec 20%) | 20.00% | 16.5–23.5% | ✅ |
| R/L Foil Legendary (spec 10%) | 10.00% | 7.0–13.0% | ✅ |
| R/L HS Rare (spec 70%) | 70.00% | 66.0–74.0% | ✅ |
| R/L HS Special (spec 20%) | 20.00% | 16.5–23.5% | ✅ |
| R/L HS Legendary (spec 10%) | 10.00% | 7.0–13.0% | ✅ |
| R/L Foil only R/S/L | 0 | = 0 | ✅ |
| R/L HS only R/S/L | 0 | = 0 | ✅ |

- HSF-slot cards with true `variantType:'Hyperspace Foil'`: 100.0% (40000/40000)

<details><summary>Per-slot variant/rarity table</summary>

| Slot | Dominant rarity mix | Dominant variant tuple (variantType\|flags) |
|---|---|---|
| 0 | Common 85.7%, Rare 14.3% | Hyperspace|H 95.1% · Showcase|S 4.9% |
| 1 | Common 100.0% | Normal|F 100.0% |
| 2 | Common 100.0% | Normal|F 100.0% |
| 3 | Common 100.0% | Normal|F 100.0% |
| 4 | Common 100.0% | Normal|F 100.0% |
| 5 | Uncommon 100.0% | Normal|F 100.0% |
| 6 | Uncommon 100.0% | Normal|F 100.0% |
| 7 | Rare 70.0%, Special 20.0%, Legendary 10.0% | Normal|F 100.0% |
| 8 | Rare 41.9%, Uncommon 34.9%, Legendary 20.9%, Special 2.3% | Standard Prestige|P 79.7% · Foil Prestige|FP 18.4% |
| 9 | Common 100.0% | Hyperspace|H 100.0% |
| 10 | Common 100.0% | Hyperspace|H 100.0% |
| 11 | Common 100.0% | Hyperspace|H 100.0% |
| 12 | Uncommon 100.0% | Hyperspace|H 100.0% |
| 13 | Rare 70.0%, Special 20.0%, Legendary 10.0% | Hyperspace|H 100.0% |
| 14 | Common 73.6%, Uncommon 16.4%, Rare 4.7%, Special 3.4%, Legendary 1.9% | Hyperspace Foil|FH 100.0% |
| 15 | Common 73.1%, Uncommon 16.7%, Rare 4.5%, Special 3.9%, Legendary 1.8% | Hyperspace Foil|FH 100.0% |

</details>

## LAW-CB (LAW+) — ⚠️ 2 band miss

| Check | Measured | Spec band | |
|---|---|---|---|
| Pack size always 16 | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Slot 0 is a leader | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Exactly 1 prestige/pack | 20000 valid / 20000 | = 20000 valid / 20000 | ✅ |
| No Normal-only cards | 0 | = 0 | ✅ |
| No wrong-set cards | 0 | = 0 | ✅ |
| No same-belt within-pack dups | 1083 packs | = 0 packs | ❌ |
| No identical-printing dups (whole pack) | 2500 packs | = 0 packs | ❌ |
| Leader always HS/Showcase | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Showcase rate (spec 2.08%) | 2.08% | 0.9–3.3% | ✅ |
| Prestige tier1 (spec 80%) | 80.02% | 77.0–83.0% | ✅ |
| Prestige tier2 (spec 18%) | 17.94% | 15.0–21.0% | ✅ |
| Prestige serialized (spec 2%) | 2.05% | 1.0–3.5% | ✅ |
| HS-Top Rare (spec 60%) | 60.25% | 56.0–64.0% | ✅ |
| HS-Top Special (spec 20%) | 20.03% | 16.5–23.5% | ✅ |
| HS-Top Legendary (spec 20%) | 19.73% | 16.5–23.5% | ✅ |
| HS-Top only R/S/L | 0 | = 0 | ✅ |
| HS-block Common (spec 62.0%) | 61.99% | 59.0–65.0% | ✅ |
| HS-block Uncommon (spec 23.6%) | 23.61% | 20.6–26.6% | ✅ |
| HSF-block Common (spec 62.0%) | 61.91% | 59.0–65.0% | ✅ |
| HSF-block Uncommon (spec 29.3%) | 29.47% | 26.3–32.3% | ✅ |

- HSF-slot cards with true `variantType:'Hyperspace Foil'`: 0.0% (0/120000)

<details><summary>Per-slot variant/rarity table</summary>

| Slot | Dominant rarity mix | Dominant variant tuple (variantType\|flags) |
|---|---|---|
| 0 | Common 85.7%, Rare 14.3% | Hyperspace|H 97.9% · Showcase|S 2.1% |
| 1 | Rare 43.9%, Uncommon 26.8%, Legendary 19.5%, Special 9.8% | Standard Prestige|P 80.0% · Foil Prestige|FP 17.9% |
| 2 | Common 100.0% | Hyperspace|H 100.0% |
| 3 | Common 100.0% | Hyperspace|H 100.0% |
| 4 | Common 100.0% | Hyperspace|H 100.0% |
| 5 | Common 100.0% | Hyperspace|H 100.0% |
| 6 | Uncommon 63.0%, Common 31.9%, Rare 3.1%, Legendary 0.9%, Special 0.9% | Hyperspace|H 100.0% |
| 7 | Uncommon 62.7%, Common 32.2%, Rare 2.9%, Legendary 1.1%, Special 1.0% | Hyperspace|H 100.0% |
| 8 | Uncommon 63.1%, Common 31.8%, Rare 3.1%, Special 1.1%, Legendary 0.9% | Hyperspace|H 100.0% |
| 9 | Rare 60.3%, Special 20.0%, Legendary 19.7% | Hyperspace|H 100.0% |
| 10 | Uncommon 44.9%, Common 42.4%, Rare 9.8%, Legendary 1.5%, Special 1.4% | Hyperspace|FH 100.0% |
| 11 | Uncommon 43.9%, Common 43.2%, Rare 9.8%, Legendary 1.6%, Special 1.5% | Hyperspace|FH 100.0% |
| 12 | Uncommon 44.0%, Common 43.0%, Rare 10.1%, Special 1.4%, Legendary 1.4% | Hyperspace|FH 100.0% |
| 13 | Uncommon 44.0%, Common 42.8%, Rare 9.9%, Special 1.7%, Legendary 1.6% | Hyperspace|FH 100.0% |
| 14 | Common 100.0% | Hyperspace|FH 100.0% |
| 15 | Common 100.0% | Hyperspace|FH 100.0% |

</details>

## ASH-CB (LAW+) — ⚠️ 2 band miss

| Check | Measured | Spec band | |
|---|---|---|---|
| Pack size always 16 | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Slot 0 is a leader | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Exactly 1 prestige/pack | 20000 valid / 20000 | = 20000 valid / 20000 | ✅ |
| No Normal-only cards | 0 | = 0 | ✅ |
| No wrong-set cards | 0 | = 0 | ✅ |
| No same-belt within-pack dups | 1079 packs | = 0 packs | ❌ |
| No identical-printing dups (whole pack) | 2478 packs | = 0 packs | ❌ |
| Leader always HS/Showcase | 20000 / 20000 | = 20000 / 20000 | ✅ |
| Showcase rate (spec 2.08%) | 1.90% | 0.9–3.3% | ✅ |
| Prestige tier1 (spec 80%) | 80.53% | 77.0–83.0% | ✅ |
| Prestige tier2 (spec 18%) | 17.51% | 15.0–21.0% | ✅ |
| Prestige serialized (spec 2%) | 1.97% | 1.0–3.5% | ✅ |
| HS-Top Rare (spec 60%) | 60.00% | 56.0–64.0% | ✅ |
| HS-Top Special (spec 20%) | 20.00% | 16.5–23.5% | ✅ |
| HS-Top Legendary (spec 20%) | 20.00% | 16.5–23.5% | ✅ |
| HS-Top only R/S/L | 0 | = 0 | ✅ |
| HS-block Common (spec 62.0%) | 62.00% | 59.0–65.0% | ✅ |
| HS-block Uncommon (spec 23.6%) | 23.63% | 20.6–26.6% | ✅ |
| HSF-block Common (spec 62.0%) | 61.84% | 59.0–65.0% | ✅ |
| HSF-block Uncommon (spec 29.3%) | 29.41% | 26.3–32.3% | ✅ |

- HSF-slot cards with true `variantType:'Hyperspace Foil'`: 0.0% (0/120000)

<details><summary>Per-slot variant/rarity table</summary>

| Slot | Dominant rarity mix | Dominant variant tuple (variantType\|flags) |
|---|---|---|
| 0 | Common 85.7%, Rare 14.3% | Hyperspace|H 98.1% · Showcase|S 1.9% |
| 1 | Rare 31.9%, Uncommon 31.9%, Legendary 27.7%, Special 8.5% | Standard Prestige|P 80.5% · Foil Prestige|FP 17.5% |
| 2 | Common 100.0% | Hyperspace|H 100.0% |
| 3 | Common 100.0% | Hyperspace|H 100.0% |
| 4 | Common 100.0% | Hyperspace|H 100.0% |
| 5 | Common 100.0% | Hyperspace|H 100.0% |
| 6 | Uncommon 62.8%, Common 32.3%, Rare 3.0%, Special 1.0%, Legendary 0.9% | Hyperspace|H 100.0% |
| 7 | Uncommon 63.0%, Common 31.9%, Rare 3.0%, Legendary 1.1%, Special 1.1% | Hyperspace|H 100.0% |
| 8 | Uncommon 63.3%, Common 31.9%, Rare 3.0%, Legendary 0.9%, Special 0.9% | Hyperspace|H 100.0% |
| 9 | Rare 60.0%, Legendary 20.0%, Special 20.0% | Hyperspace|H 100.0% |
| 10 | Uncommon 44.1%, Common 42.9%, Rare 10.2%, Legendary 1.4%, Special 1.4% | Hyperspace|FH 100.0% |
| 11 | Uncommon 44.3%, Common 42.9%, Rare 9.8%, Special 1.5%, Legendary 1.5% | Hyperspace|FH 100.0% |
| 12 | Uncommon 43.9%, Common 42.6%, Rare 10.4%, Special 1.6%, Legendary 1.5% | Hyperspace|FH 100.0% |
| 13 | Uncommon 44.2%, Common 42.6%, Rare 10.2%, Legendary 1.6%, Special 1.5% | Hyperspace|FH 100.0% |
| 14 | Common 100.0% | Hyperspace|FH 100.0% |
| 15 | Common 100.0% | Hyperspace|FH 100.0% |

</details>

---

**10 band miss(es) across all sets — see ❌ rows.**
