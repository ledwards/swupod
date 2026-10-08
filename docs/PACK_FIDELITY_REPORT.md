# Pack Fidelity Report — Theory vs. Production

_Generated 2026-06-17T10:11:56.227Z from `.env.local (dev)`._

Theory: Monte-Carlo of the live generator, **collation v1**, 2,500 pods/set (15,000 packs/set), generated 2026-06-17T09:42:05.534Z.

## Method

Each booster card pulled in production is tallied by **rarity**, **aspect** (color category), and **variant treatment**, then compared per-pack against theory. Because the collation system produces *constrained, sub-Poisson* counts (exactly 16 cards/pack, one leader, without-replacement hoppers), a chi-square test would misstate significance. Instead we use the Monte-Carlo per-pack standard deviation and the Central Limit Theorem: over *M* packs the observed total is ≈ Normal(mean·M, (sd·√M)²), and **z = (observed − mean·M) / (sd·√M)**.

Verdicts: **✅ aligned** (p ≥ 0.01), **🟡 minor** (significant but <5% effect — expected at large N), **🔴 notable** (significant *and* ≥5% per-pack deviation), **⛔ mismatch** (a deterministic slot off by ≥1%).

## How to read it — important caveats

- **Version skew is the biggest confound.** Production rows span the app's entire history and were generated under *earlier* collation versions, while theory is the *current* algorithm (v1). A divergence can mean the live collation differs from what older packs were cut under — not that today's generator is wrong. The clearest example: a brand-new slot (e.g. LAW prestige, ~1/18 in theory) reads as **−100%** because the production history predates it (note whether `prestige` even appears in the treatment list above). To judge the *current* algorithm, re-run filtered to packs generated since the last collation change.
- **Aspect gaps reflect card-data drift.** Theory classifies each generated card by its `cards.json` aspects; actuals classify each row by the aspects stored *at generation time*. A systematic Neutral/Multicolor gap means that stored aspect data differs from today's catalog, not that the wheel is mis-weighted.
- **Large N makes trivial gaps significant.** Sets like LAW (tens of thousands of packs) flag sub-1% deltas as statistically significant; that is why the effect-size gate exists — trust the 🔴 **notable** rows, treat 🟡 **minor** as essentially aligned.
- **Small N is underpowered.** Pre-release sets (few packs) will mostly read aligned for lack of data, not for fidelity.

Sets analysed: **8**.

## Distinct DB treatment values seen

Verify the variant mapping (`scripts/comparePackActuals.ts` → `variantBucket`) against these:

```
base
foil
hyperspace
hyperspace_foil
showcase +showcase
```

## Per-set comparison

### SOR — 3,253 packs (52,047 cards) — ⚠️ 3 dimension(s) diverge

**Rarity** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Common | 11.605 | 11.618 | 0.1% | 1.33 | 0.182 | ✅ aligned |
| Uncommon | 3.117 | 3.048 | -2.2% | -9.34 | <0.001 | 🟡 minor |
| Rare | 1.145 | 1.204 | 5.1% | 5.70 | <0.001 | 🔴 notable |
| Legendary | 0.132 | 0.130 | -1.5% | -0.33 | 0.741 | ✅ aligned |

**Aspect** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Vigilance | 3.538 | 3.468 | -2.0% | -3.21 | 0.001 | 🟡 minor |
| Command | 3.407 | 3.492 | 2.5% | 3.72 | <0.001 | 🟡 minor |
| Aggression | 3.371 | 3.454 | 2.5% | 4.06 | <0.001 | 🟡 minor |
| Cunning | 3.301 | 3.520 | 6.7% | 10.85 | <0.001 | 🔴 notable |
| Neutral | 2.384 | 2.041 | -14.4% | -23.96 | <0.001 | 🔴 notable |
| Multicolor | 0.000 | 0.025 | — | — | — | ⛔ mismatch |

**Variant** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| foil | 0.979 | 0.983 | 0.4% | 1.58 | 0.114 | ✅ aligned |
| hyperspace | 0.766 | 0.830 | 8.4% | 5.11 | <0.001 | 🔴 notable |
| hyperspaceFoil | 0.021 | 0.016 | -20.7% | -1.71 | 0.088 | ✅ aligned |
| showcase | 0.003 | 0.004 | 6.4% | 0.22 | 0.830 | ✅ aligned |

### SHD — 1,489 packs (23,822 cards) — ⚠️ 3 dimension(s) diverge

**Rarity** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Common | 11.607 | 11.596 | -0.1% | -0.79 | 0.427 | ✅ aligned |
| Uncommon | 3.123 | 3.030 | -3.0% | -8.42 | <0.001 | 🟡 minor |
| Rare | 1.138 | 1.230 | 8.1% | 6.15 | <0.001 | 🔴 notable |
| Legendary | 0.131 | 0.143 | 9.0% | 1.34 | 0.180 | ✅ aligned |
| Special | 0.000 | 0.000 | -100.0% | -0.55 | 0.585 | ✅ aligned |

**Aspect** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Command | 3.905 | 3.580 | -8.3% | -9.21 | <0.001 | 🔴 notable |
| Cunning | 3.584 | 3.689 | 2.9% | 4.06 | <0.001 | 🟡 minor |
| Aggression | 3.219 | 3.478 | 8.0% | 7.58 | <0.001 | 🔴 notable |
| Vigilance | 3.172 | 3.625 | 14.3% | 13.47 | <0.001 | 🔴 notable |
| Neutral | 2.119 | 1.608 | -24.1% | -22.71 | <0.001 | 🔴 notable |
| Multicolor | 0.000 | 0.018 | — | — | — | ⛔ mismatch |

**Variant** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| foil | 0.980 | 0.981 | 0.2% | 0.44 | 0.663 | ✅ aligned |
| hyperspace | 0.758 | 0.808 | 6.6% | 2.69 | 0.007 | 🔴 notable |
| hyperspaceFoil | 0.020 | 0.019 | -7.8% | -0.44 | 0.663 | ✅ aligned |
| showcase | 0.003 | 0.003 | -6.3% | -0.13 | 0.896 | ✅ aligned |

### TWI — 1,853 packs (29,650 cards) — ⚠️ 3 dimension(s) diverge

**Rarity** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Common | 11.606 | 11.617 | 0.1% | 0.80 | 0.422 | ✅ aligned |
| Uncommon | 3.123 | 3.019 | -3.3% | -10.31 | <0.001 | 🟡 minor |
| Rare | 1.141 | 1.217 | 6.7% | 5.79 | <0.001 | 🔴 notable |
| Legendary | 0.130 | 0.147 | 13.3% | 2.19 | 0.029 | ✅ aligned |
| Special | 0.000 | 0.000 | -100.0% | -0.50 | 0.620 | ✅ aligned |

**Aspect** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Aggression | 3.562 | 3.437 | -3.5% | -4.85 | <0.001 | 🟡 minor |
| Vigilance | 3.552 | 3.531 | -0.6% | -0.68 | 0.495 | ✅ aligned |
| Command | 3.355 | 3.437 | 2.5% | 3.24 | 0.001 | 🟡 minor |
| Cunning | 3.107 | 3.479 | 12.0% | 14.58 | <0.001 | 🔴 notable |
| Neutral | 2.424 | 2.100 | -13.4% | -13.67 | <0.001 | 🔴 notable |
| Multicolor | 0.000 | 0.017 | — | — | — | ⛔ mismatch |

**Variant** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| foil | 0.981 | 0.985 | 0.5% | 1.45 | 0.146 | ✅ aligned |
| hyperspace | 0.766 | 0.832 | 8.6% | 4.00 | <0.001 | 🔴 notable |
| hyperspaceFoil | 0.019 | 0.017 | -10.1% | -0.61 | 0.545 | ✅ aligned |
| showcase | 0.003 | 0.003 | -6.6% | -0.17 | 0.867 | ✅ aligned |

### JTL — 2,666 packs (42,654 cards) — ⚠️ 3 dimension(s) diverge

**Rarity** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Common | 11.587 | 11.519 | -0.6% | -6.26 | <0.001 | 🟡 minor |
| Uncommon | 3.117 | 3.059 | -1.9% | -6.98 | <0.001 | 🟡 minor |
| Rare | 1.071 | 1.192 | 11.3% | 10.66 | <0.001 | 🔴 notable |
| Legendary | 0.172 | 0.175 | 1.7% | 0.39 | 0.699 | ✅ aligned |
| Special | 0.053 | 0.055 | 3.8% | 0.46 | 0.649 | ✅ aligned |

**Aspect** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Vigilance | 3.596 | 3.623 | 0.8% | 1.25 | 0.212 | ✅ aligned |
| Command | 3.589 | 3.591 | 0.1% | 0.09 | 0.928 | ✅ aligned |
| Cunning | 3.468 | 3.533 | 1.9% | 2.58 | 0.010 | 🟡 minor |
| Aggression | 3.442 | 3.621 | 5.2% | 8.25 | <0.001 | 🔴 notable |
| Neutral | 1.904 | 1.623 | -14.8% | -22.22 | <0.001 | 🔴 notable |
| Multicolor | 0.000 | 0.008 | — | — | — | ⛔ mismatch |

**Variant** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| foil | 0.980 | 1.149 | 17.3% | 62.43 | <0.001 | 🔴 notable |
| hyperspace | 0.761 | 0.965 | 26.7% | 14.66 | <0.001 | 🔴 notable |
| hyperspaceFoil | 0.020 | 0.073 | 265.7% | 19.60 | <0.001 | 🔴 notable |
| showcase | 0.004 | 0.004 | 14.6% | 0.45 | 0.650 | ✅ aligned |

### LOF — 3,261 packs (52,172 cards) — ⚠️ 3 dimension(s) diverge

**Rarity** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Common | 11.581 | 11.523 | -0.5% | -5.74 | <0.001 | 🟡 minor |
| Uncommon | 3.116 | 3.046 | -2.3% | -9.19 | <0.001 | 🟡 minor |
| Rare | 1.078 | 1.180 | 9.4% | 9.86 | <0.001 | 🔴 notable |
| Legendary | 0.171 | 0.195 | 13.9% | 3.57 | <0.001 | 🔴 notable |
| Special | 0.053 | 0.055 | 2.8% | 0.37 | 0.709 | ✅ aligned |

**Aspect** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Vigilance | 3.498 | 3.417 | -2.3% | -3.90 | <0.001 | 🟡 minor |
| Aggression | 3.483 | 3.443 | -1.2% | -2.11 | 0.035 | ✅ aligned |
| Command | 3.336 | 3.409 | 2.2% | 3.10 | 0.002 | 🟡 minor |
| Cunning | 3.335 | 3.380 | 1.3% | 2.13 | 0.033 | ✅ aligned |
| Neutral | 2.348 | 2.338 | -0.4% | -0.69 | 0.489 | ✅ aligned |
| Multicolor | 0.000 | 0.013 | — | — | — | ⛔ mismatch |

**Variant** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| foil | 0.980 | 1.148 | 17.1% | 68.92 | <0.001 | 🔴 notable |
| hyperspace | 0.759 | 0.952 | 25.4% | 15.36 | <0.001 | 🔴 notable |
| hyperspaceFoil | 0.020 | 0.074 | 273.0% | 22.12 | <0.001 | 🔴 notable |
| showcase | 0.003 | 0.005 | 73.8% | 2.31 | 0.021 | ✅ aligned |

### SEC — 44,764 packs (716,227 cards) — ⚠️ 3 dimension(s) diverge

**Rarity** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Common | 11.574 | 11.555 | -0.2% | -7.06 | <0.001 | 🟡 minor |
| Uncommon | 3.118 | 3.040 | -2.5% | -37.48 | <0.001 | 🟡 minor |
| Rare | 1.082 | 1.232 | 13.9% | 53.87 | <0.001 | 🔴 notable |
| Legendary | 0.172 | 0.149 | -13.3% | -12.65 | <0.001 | 🔴 notable |
| Special | 0.055 | 0.025 | -55.0% | -27.82 | <0.001 | 🔴 notable |

**Aspect** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Vigilance | 3.529 | 3.462 | -1.9% | -12.70 | <0.001 | 🟡 minor |
| Command | 3.488 | 3.442 | -1.3% | -7.16 | <0.001 | 🟡 minor |
| Aggression | 3.378 | 3.519 | 4.2% | 24.92 | <0.001 | 🟡 minor |
| Cunning | 3.375 | 3.459 | 2.5% | 13.11 | <0.001 | 🟡 minor |
| Neutral | 2.230 | 2.096 | -6.0% | -38.65 | <0.001 | 🔴 notable |
| Multicolor | 0.000 | 0.022 | — | — | — | ⛔ mismatch |

**Variant** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| foil | 0.980 | 1.008 | 2.8% | 41.70 | <0.001 | 🟡 minor |
| hyperspace | 0.754 | 0.949 | 25.8% | 57.52 | <0.001 | 🔴 notable |
| hyperspaceFoil | 0.020 | 0.021 | 5.8% | 1.75 | 0.081 | ✅ aligned |
| showcase | 0.005 | 0.003 | -33.4% | -4.91 | <0.001 | 🔴 notable |

### LAW — 88,341 packs (1,413,460 cards) — ⚠️ 3 dimension(s) diverge

**Rarity** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Common | 11.500 | 11.492 | -0.1% | -3.95 | <0.001 | 🟡 minor |
| Uncommon | 2.999 | 3.009 | 0.4% | 5.94 | <0.001 | 🟡 minor |
| Rare | 1.212 | 1.218 | 0.5% | 2.73 | 0.006 | 🟡 minor |
| Legendary | 0.217 | 0.227 | 4.3% | 6.48 | <0.001 | 🟡 minor |
| Special | 0.072 | 0.054 | -25.1% | -20.38 | <0.001 | 🔴 notable |

**Aspect** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Command | 3.084 | 3.084 | -0.0% | -0.12 | 0.907 | ✅ aligned |
| Vigilance | 3.050 | 3.195 | 4.7% | 35.66 | <0.001 | 🟡 minor |
| Aggression | 2.883 | 3.012 | 4.5% | 33.36 | <0.001 | 🟡 minor |
| Cunning | 2.858 | 3.029 | 6.0% | 44.70 | <0.001 | 🔴 notable |
| Multicolor | 2.694 | 2.473 | -8.2% | -45.41 | <0.001 | 🔴 notable |
| Neutral | 1.431 | 1.207 | -15.6% | -73.33 | <0.001 | 🔴 notable |

**Variant** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| hyperspace | 1.781 | 1.573 | -11.7% | -86.11 | <0.001 | 🔴 notable |
| hyperspaceFoil | 1.000 | 1.006 | 0.6% | — | — | ✅ aligned |
| prestige | 0.055 | 0.000 | -100.0% | -71.98 | <0.001 | 🔴 notable |
| showcase | 0.002 | 0.001 | -55.2% | -6.70 | <0.001 | 🔴 notable |

### ASH — 84 packs (1,338 cards) — ⚠️ 1 dimension(s) diverge

**Rarity** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Common | 11.487 | 11.476 | -0.1% | -0.16 | 0.873 | ✅ aligned |
| Uncommon | 2.986 | 2.964 | -0.7% | -0.37 | 0.709 | ✅ aligned |
| Rare | 1.236 | 1.238 | 0.1% | 0.02 | 0.981 | ✅ aligned |
| Legendary | 0.224 | 0.190 | -14.8% | -0.69 | 0.492 | ✅ aligned |
| Special | 0.067 | 0.060 | -11.2% | -0.27 | 0.786 | ✅ aligned |

**Aspect** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| Command | 3.530 | 3.369 | -4.6% | -1.24 | 0.216 | ✅ aligned |
| Cunning | 3.393 | 3.238 | -4.6% | -1.21 | 0.226 | ✅ aligned |
| Aggression | 3.285 | 3.417 | 4.0% | 1.01 | 0.311 | ✅ aligned |
| Vigilance | 3.245 | 3.512 | 8.2% | 1.82 | 0.069 | ✅ aligned |
| Neutral | 1.939 | 1.869 | -3.6% | -0.40 | 0.689 | ✅ aligned |
| Multicolor | 0.608 | 0.524 | -13.8% | -1.06 | 0.287 | ✅ aligned |

**Variant** (per pack)

| Bucket | Theory | Actual | Δ% | z | p | Verdict |
|---|--:|--:|--:|--:|--:|---|
| foil | 1.000 | 0.000 | -100.0% | — | — | ⛔ mismatch |
| prestige | 0.058 | 0.000 | -100.0% | -2.27 | 0.023 | ✅ aligned |
| hyperspace | 0.000 | 1.321 | — | — | — | ⛔ mismatch |
| hyperspaceFoil | 0.000 | 0.786 | — | — | — | ⛔ mismatch |

