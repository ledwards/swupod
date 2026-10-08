# Pack Generation Audit — All Sets

**Snapshot: 2026-08-18.** 48,000 generated packs (250 boxes x 24 packs per set,
8 sets), measured on `main` at commit `50292788`.

> These are MEASURED numbers, not specs. They go stale the moment a belt, a set
> config, or `src/data/cards.json` changes. Treat this as a dated reference
> point, not a source of truth — the specs live in `src/utils/packConstants.ts`
> and `src/utils/setConfigs/`, and the re-runnable checks are `npm run qa` plus
> `scripts/collation-benchmark.ts`. See "Reproducing this" at the bottom.

---

## A. Structure — hard invariants

Every pack must have 16 cards, exactly one leader, and exactly one common base.

| set | packs | malformed |
|---|---|---|
| SOR | 6,000 | **0** |
| SHD | 6,000 | **0** |
| TWI | 6,000 | **0** |
| JTL | 6,000 | **0** |
| LOF | 6,000 | **0** |
| SEC | 6,000 | **0** |
| LAW | 6,000 | **0** |
| ASH | 6,000 | **0** |

Zero violations in 48,000 packs. These are structural, not statistical — a single
failure here is a real bug, never noise.

## B. Slot rates vs spec

Spec: hyperspace leader and base each 1/6 = 16.7%. If the two upgrade
independently, packs holding both occur at 1/6 x 1/6, so the ratio below should
sit at 1.00.

| set | HS leader | HS base | L+B / independent | HS common per pack | foil = HS foil | R:L |
|---|---|---|---|---|---|---|
| SOR | 16.5% | 16.9% | 0.88 | 0.20 | 2% | 6.5:1 |
| SHD | 16.5% | 16.5% | 0.91 | 0.20 | 2% | 6.7:1 |
| TWI | 16.5% | 16.4% | 0.95 | 0.20 | 2% | 6.5:1 |
| JTL | 16.7% | 16.6% | 1.12 | 0.20 | 2% | 3.5:1 |
| LOF | 16.7% | 16.8% | 1.02 | 0.20 | 2% | 3.4:1 |
| SEC | 16.9% | 17.0% | 1.07 | 0.20 | 2% | 4.1:1 |
| LAW | 16.4% | 16.8% | 0.79 | 1.04 | 100% | 3.9:1 |
| ASH | 16.6% | 16.7% | 1.08 | 1.04 | 100% | 4.1:1 |

Every set within 0.4pp of the 16.7% spec. Co-occurrence centres on 1.00 across
all eight — it was **exactly 0.00 on Sets 1-6** before 2026-08-16, when an
exclusivity rule falsified by real ASH pool-002 pack06 was removed. The spread
(0.79-1.12) is sampling noise on roughly 170 joint events per set.

LAW and ASH correctly show the guaranteed hyperspace common (1.04/pack) and the
always-hyperspace foil slot (100%); Sets 1-6 correctly show neither.

## C. Hyperspace cards per pack

Slots upgrade independently, so three in one pack must be POSSIBLE — just
unlikely. A hard cap would be a modelling error. The QA assertion bounds this at
8% rather than forbidding it.

| set | mean | 3+ rate |
|---|---|---|
| SOR | 0.76 | 2.63% |
| SHD | 0.76 | 2.63% |
| TWI | 0.76 | 2.55% |
| JTL | 0.77 | 2.90% |
| LOF | 0.77 | 3.22% |
| SEC | 0.77 | 2.87% |
| LAW | 1.69 | 13.55% |
| ASH | 1.69 | 13.18% |

LAW and ASH run higher because their guaranteed hyperspace common counts toward
the total alongside upgrades.

## D. Per-card frequency — the short-print check

Worst deviation of any single card from its rarity-pool mean, in sigma, where
sigma = sqrt(expected). Two-sided: printed too often is as wrong as too rarely.
`exp` is the expected count per card over the sample; `r` is max/min across the
pool. **The QA assertion fails at 6.0 sigma.**

| set | Common | Uncommon | Rare | Legendary |
|---|---|---|---|---|
| SOR | 2.3s (exp 638, r 1.15) | 1.8s (exp 293, r 1.16) | 1.7s (exp 108, r 1.34) | 1.6s (exp 48, r 1.57) |
| SHD | 3.3s (exp 638, r 1.21) | 1.1s (exp 292, r 1.14) | 2.2s (exp 106, r 1.54) | 1.7s (exp 50, r 1.50) |
| TWI | 2.3s (exp 638, r 1.14) | 1.4s (exp 294, r 1.18) | 2.2s (exp 106, r 1.50) | 2.4s (exp 47, r 1.88) |
| JTL | 1.5s (exp 584, r 1.12) | 1.2s (exp 293, r 1.13) | 2.3s (exp 100, r 1.52) | 1.6s (exp 62, r 1.47) |
| LOF | 1.8s (exp 572, r 1.14) | 1.4s (exp 294, r 1.18) | 2.7s (exp 99, r 1.68) | 1.6s (exp 65, r 1.47) |
| SEC | 1.3s (exp 572, r 1.12) | 1.2s (exp 293, r 1.13) | 1.7s (exp 101, r 1.38) | 2.3s (exp 61, r 1.61) |
| LAW | 1.3s (exp 477, r 1.10) | 0.7s (exp 263, r 1.09) | 2.0s (exp 96, r 1.40) | 1.6s (exp 61, r 1.49) |
| ASH | 0.7s (exp 478, r 1.06) | 0.7s (exp 264, r 1.08) | 2.8s (exp 96, r 1.58) | 1.4s (exp 60, r 1.43) |

Nothing above 3.3 sigma anywhere — ordinary max-of-N noise for pools of 50-100
cards. For contrast, at the start of 2026-08-18 this table read **8.7 sigma**
(ASH Uncommon), **5.8 sigma** (JTL Common) and two LAW cards at ~7-10% below
their lane. See "Defects fixed" below.

## E. Box and pool level

| set | box unique | dup/pool | nn P(0) | loaded | prestige/box | max/box |
|---|---|---|---|---|---|---|
| SOR | 168.5 | 4.37 | 1.2% | 0.6% | — | — |
| SHD | 170.0 | 4.47 | 1.0% | 0.6% | — | — |
| TWI | 168.6 | 4.44 | 1.4% | 0.5% | — | — |
| JTL | 177.5 | 3.32 | 2.5% | 0.0% | — | — |
| LOF | 179.8 | 3.24 | 3.0% | 0.0% | — | — |
| SEC | 181.3 | 3.27 | 2.5% | 0.0% | — | — |
| LAW | 186.1 | 6.41 | 43.4% | 4.3% | 1.34 | 2 |
| ASH | 186.5 | 6.55 | 45.1% | 6.1% | 1.10 | 2 |

`dup/pool` counts duplicated card identities in a 6-pack pool, variant-invariant
(a Normal and its Hyperspace pair). `nn P(0)` is the share of pools with zero
Normal+Normal duplicate pairs. `loaded` is the share of pools with 10 or more
duplicate identities.

Sets 1-6 and Sets 7+ differ structurally here and should not be compared: only
LAW/ASH use line-stacking collation, and only they carry a guaranteed hyperspace
common, which drives most of the cross-variant duplication.

Prestige appears only in LAW (1/18 -> 1.34 per box) and ASH (1/22 -> 1.10), never
three or more in one box, matching 11 verified real boxes.

---

## What is actually validated against reality

The numbers above are the generator agreeing with its own configuration. That is
necessary but not sufficient. Only one set is anchored to transcribed physical
product:

| set | anchor | status |
|---|---|---|
| **ASH** | 11 transcribed boxes (`data/real-boxes/ash-box-*.csv`), 42 complete pools | Two-sample KS test of duplicates-per-pool: D ≈ 0.15 against an alpha=0.05 critical value of 0.213. Consistent, though the generator runs slightly high on the mean (6.6 vs 6.19 real) and thinner in the low tail. |
| **LAW** | 3 genuinely real pools | 4, 5, 4 duplicate identities against a generator producing 6.41. Far too few to act on, but it is the second independent hint that LAW may collate tighter than ASH. |
| **SOR–SEC** | none | No transcribed pack exists. Internally consistent and matching configured rates, but unvalidated against a real box. |

A caution on the LAW figure: of the ten `scripts/eval/fixtures/*-law` directories,
five are marked `_note` (STARTER / deck-only / draft registration), one
(`local-lee-law`) is byte-identical to `casual-lee-law`, and one
(`sfpq-lee-law`) is a PTP pool export — our own generator's output, fine for OCR
eval but not usable as collation ground truth. Three remain. Anyone recomputing
this must apply the same filtering or they will get a false result.

**The single highest-value thing that would improve confidence is a
transcribed box from any of SOR–SEC** — tracked as an open item in
`plans/ASH_COLLATION_FINDINGS.md` ("OPEN: transcribe a Sets 1-6 box"), which
carries the power maths: one box is a coin flip (~49% chance of the decisive
observation), two is the sensible minimum, four gets past 90%.

It does not need variant IDs or careful frame-matching — spotting which cards are
hyperspace is enough to check leader/base co-occurrence and hyperspace-per-pack,
the two assumptions Sets 1-6 currently rest on without evidence.

## Defects fixed on the way to this table

All three were the same class: **a card that always landed at the same position
in the belt's boot, meeting a slot that gets consumed differently.**

| where | cause | effect | fix |
|---|---|---|---|
| `UncommonBelt` | Largest-aspect-group-first placement gave a group of ONE card a single fixed slot. ASH has exactly one Heroism-primary and one Villainy-primary uncommon. | Landed at boot index ~62.8 against a per-box horizon of 63.36 (72 draws minus ~8.6 `putBack()` returns) — reached in only 59.5% of boxes. 8.7 and 6.1 sigma low. | Weighted-random group choice with a feasibility guard |
| `CommonBelt` | `buildAspectTargetPositions` computed target indices as a pure function of `(count, total)`. A group of 1 gets one slot and nothing to shuffle. JTL belt A has exactly one aspectless common. | `Evasive Maneuver` sat at pack index 5 — the block-A `hyperspaceSlot` — in every pack, absorbing the lane's whole upgrade rate. 89.0% survival vs 102-104% for its 48 lane-mates. | Random phase offset on the spacing pattern |
| `CommonBelt` | Candidates ranked by HOW MANY required aspects they carry. If exactly one card carries two, it wins that tiebreak at every position until placed. | LAW `Devaronian Doorbuster` (only Command+Cunning) at boot index 0-2 in 100% of boots, 90.5% survival vs 99.4% median; `Bith Brute` (only Vigilance+Aggression) 93.0%. | Boolean "does it help" instead of a count |

Note the second and third are NOT about neutral/aspectless cards specifically —
LOF's stuck card was Heroism, and SOR belt A has six aspectless commons with no
problem at all. It is group SIZE of one, whatever the aspect.

A sweep of all 8 belts x 8 sets now finds no card holding a fixed boot index.

## Reproducing this

```bash
npm run qa                                        # all 7 statistical suites
npx tsx scripts/collation-benchmark.ts --boxes=400 --set=ASH
npx tsx src/qa/printerDistribution.test.ts        # per-card frequency, all sets + KS
```

The sweep that produced tables A-E was a throwaway script, deliberately not
committed — the durable checks are the QA suites, which assert the same
properties with real-data bands. If you need the raw table again, regenerate it
rather than trusting these numbers after any belt or card-data change.

### A note on statistical assertions in the QA suite

A fixed threshold on a sampled statistic false-alarms at its alpha rate BY
CONSTRUCTION. Three cases were corrected on 2026-08-18:

- `foilDistribution` chi-squared ran at p=0.01 (1 failure per 100 runs with
  nothing wrong). Doubling the sample bought a move to p=0.001 at no cost in
  sensitivity: 1200 foils at p=0.001 still detects a 3pp shift, and false-alarms
  ten times less often.
- `lineStacking` at 40 boxes had two rate assertions sitting under 2 standard
  deviations from their band edges — that suite was failing on roughly 12% of
  runs. Raised to 500 boxes, all margins now beyond 4.8 sd.
- A seat ceiling added the same day was removed rather than tuned: normal
  behaviour ran 13.0 +/-1.6 against a 16.0 ceiling (1.9 sd), and the bug it
  guarded produced 17.3-18.3, so no threshold gave both low false alarms and
  detection. That regression is caught structurally instead — passing a non-24
  box size to a Set 7+ generator throws.

**Before adding a statistical assertion, measure the statistic's run-to-run
spread and check the distance to your threshold in standard deviations. Under
4 sd will bite you.** Margins measured 2026-08-18 for the surviving assertions
ranged 4.6 to 64 sd; `beltSlotAspects` and `seamAwareBelt` assert structural
invariants and cannot false-alarm at all.
