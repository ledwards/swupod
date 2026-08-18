---
paths:
  - "src/belts/**"
  - "src/utils/boosterPack*"
  - "src/utils/carboniteBoosterPack*"
  - "src/utils/carboniteConstants*"
  - "src/utils/packConstants*"
---

# Belt System Rules

## Physical Printer Metaphor
The belt system mimics a **real-life card printing press**. Cards come off belts in sequence.

- **NEVER** add post-hoc passes that examine the pack and modify it (dedup passes, reordering, slot-aware fixups)
- **NEVER** add logic where one belt checks what another belt produced. Belts are independent physical systems.
- Cross-belt duplicates are realistic and acceptable. Only same-belt duplicates indicate a bug.
- **NEVER exclude cards from a boot** — every card appears exactly once per cycle. Dedup by PLACEMENT, not exclusion.

## Three Orders: Line → Box → Consumption (Set 7+)

Belts are only HALF the physical model. A pack passes through three distinct orderings, and
mixing them up is the most common source of wrong reasoning about this code.

**1. LINE order** — the order packs come off the press. Belts emit here. **Every belt spacing
rule (dedup windows, gap floors, aspect rotation, seam behavior) is a LINE-order rule.** A belt
has no knowledge of anything downstream.

**2. BOX order** — `stackBoxOrder()` in `boosterPack.ts`. Physical box assembly: packs are
stacked bottom-up in left/right pairs into two interleaved columns of 12.

```
line k odd  → box position 12 - (k-1)/2      line k even → box position 24 - (k-2)/2
box positions 1-6 = LINE packs 23, 21, 19, 17, 15, 13   (every other pack, reversed)
```

Whole packs move; contents are never touched. Gated on `packRules.lineStackingCollation`
(Set 7+ only; Sets 1-6 return line order unchanged).

**⚠️ A BOX IS ALWAYS 24 PACKS.** Column depth 12 is a property of the product, not a parameter.
`stackBoxOrder` generalizes to `half = n/2` and `generateSealedBox` exposes `boxSize` as a
defaulted argument — **both are traps.** Passing any other size invents a box that does not
exist and silently changes which line packs land adjacent in a player's pool. Packs for N
players must be cut from real 24-pack boxes (`generateSealedPod`'s virtual-box buffer does this
correctly). *Known violation: the sealed pod route passes `players * packsPerPlayer`.*

**3. CONSUMPTION order** — how a player takes packs out: top-down by column, i.e. consecutive
box positions. This is what the player experiences and what benchmark metrics labelled
"consumer order" are calibrated against.

**Consumption order is an ASSUMPTION, not a measured result.** The load order (1→2) has three
independent statistical confirmations on box 001. The pull order has none — its only source is
the removal order used to photograph boxes for transcription. Box data records where packs sat,
not how a human removes them. Treat it as unverified; do not cite it as observed.

- **NEVER** make a belt aware of box or consumption order. The press cannot know how the box
  will later be stacked, and stacking cannot know how a player will grab packs.
- A repeat at a legal LINE gap can land 1-2 packs apart for the player. That is the model
  working, not a bug.

Sources: `plans/LINE_STACKING_COLLATION_PLAN.md` (shipped 2026-07-03),
`plans/ASH_COLLATION_FINDINGS.md`, `docs/collation-benchmark-*.md`.

## Leader + Base Hyperspace May Co-occur — On Every Set

Real ASH pool-002 pack06 held a hyperspace leader AND a hyperspace base in one
pack. The old exclusivity rule gave that physically real pack probability zero. It
is the same press for every set, so `allowLeaderBaseCoOccurrence` is now **true on
every group**, not only the ones we have transcribed boxes for.

Every group now runs the spaced-sheet path (`spaceUpgrades: true`) and reaches the
independent rate — measured 0.90-1.05x of 1/36 across all eight sets.

## There Is No Hard Upgrade Cap

**Slots upgrade INDEPENDENTLY.** Leader, base, common and the UC slots each decide
on their own, so their overlaps are whatever independence produces. A pack with 3
upgrades is therefore *unlikely, not impossible*, and a hard cap is a modelling
error rather than a rule.

Two things follow, and both were previously wrong in this codebase:

- **The no-upgrade rate is a product, not a quota.** P(no upgrade) = Π(1 - rate)
  over the slots, from `HS_BELT_CONFIGS` slotCounts — 43.4% for group `1-3`, not
  the 40% a budget-0 quota implies. Tests derive it; they do not hardcode a share.
- **3+ upgrades must stay possible.** Measured ~2.5% of Sets 1-6 packs at 3 and
  ~0.2% at 4+; LAW/ASH sit higher only because their guaranteed HS common is
  counted alongside upgrades. Assertions bound the rate (`<= 8%`) so it stays rare;
  none of them may forbid it.

**NEVER** re-introduce exclusivity or a budget cap to "tidy" a distribution. Zero
co-occurrence and hard ceilings are the bugs; a low-but-nonzero tail is the physics.

## Reality Is Clumpier Than The Model

When someone reports "too many duplicates," do **NOT** propose anything that makes the
generator emit fewer. Measured: *"Our variance is ~half of reality's — we never produce a clumpy
pool (13 pairs = +4.4σ for us; reality had 3 pools ≥10 pairs in 12)."*

Specifically forbidden, all previously rejected:
- Coupling belts (e.g. sharing history between `LeaderBelt` and `HyperspaceLeaderBelt`)
- Tightening a dedup gap floor, or enforcing spacing in box/consumer order
- Flattening the per-box concentration tail

Every validated correction here has gone the other way — **removing** constraints.
`HyperspaceUpgradeBelt` once forbade HS-leader + HS-base co-occurrence until a real pack showed
both, meaning the model gave a physically real pack probability zero; the fix was to drop the
constraint (now confirmed real at ~1/36).

**NEVER fit a parameter to one box.** `PAIR_PACK_GAPS` was fit to box-001 alone — the one clumpy
outlier — and had to be refit against six number-verified boxes. A single box's tightest gap or
max copy count is an order statistic, not an effect.

The only valid question is: *does the model deviate from real transcribed box data, across
enough boxes to be an effect?* If the behavior matches real boxes, say so and change nothing.
Look for plain implementation errors (wrong box size, line-vs-box-order mixups, an
unused-but-correct code path) — not tuning knobs.

**How to answer that question properly.** `printerDistribution.test.ts` parses the
transcribed boxes in `data/real-boxes/*.csv` directly and runs a two-sample
Kolmogorov-Smirnov test of duplicates-per-pool against the generator — 42 complete
real pools in consumer order versus 1400 generated. D currently sits at 0.15-0.18
against an α=0.05 critical value of 0.213: consistent, with the generator slightly
high on the mean (6.6-6.75 vs 6.19 real) and thinner in the low tail.

That is the strongest statement the available data supports, and it is what to re-run
before claiming any duplicate-rate change is an improvement. Mean, P(0) and a single
tail bucket can all sit in band while the SHAPE drifts — KS is what catches that. Do
not swap it for a mean comparison.

## Belt Types
- **LeaderBelt**: 1 leader per pack, alternates common/rare with seam deduplication
- **BaseBelt**: 1 common base per pack, aspect-based deduplication
- **CommonBelt**: 9 commons, uses A/B pools for deduplication
- **UncommonBelt**: 3 uncommons
- **RareLegendaryBelt**: 1 rare or legendary
- **FoilBelt**: 1 foil of any rarity
- **ShowcaseLeaderBelt**: Very rare showcase leaders (~1 in 288 packs)
- **HyperspaceUpgradeBelt**: Controls HS upgrade distribution per pack (budget belt, not coin flips). Pre-determines which slots get HS upgrades in cycles of 60 packs. ~2/3 of packs get at least 1 HS, max 2.
- **Hyperspace belts**: Various hyperspace variants (card selection after upgrade decision)

## Carbonite Belts (premium packs where every card is a variant)
- **CarboniteSlotBelt**: Configurable belt for rarity-locked carbonite slots
- **CarboniteFoilRLBelt**: Weighted R/L Foil slot (70% Rare / 20% Special / 10% Legendary)
- **CarbonitePrestigeBelt**: Prestige card slot (synthesized from R/L pool)
- **HyperfoilBelt**: Hyperspace Foil cards (used in both standard and carbonite packs)

## Key Constraints
- **24-position dedup window**: min(24, floor(beltSize/2)) positions, including across seam boundaries
- **Primary aspect interleaving**: No adjacent cards share the same primary aspect (aspects[0])
- **Equal occurrence rate**: Every card appears exactly once per boot

### Equal occurrence is not enough — position must be random too
Once-per-boot is necessary but NOT sufficient. A boot is only partly consumed before
the belt is thrown away, so a card with a DETERMINISTIC position in the boot is
printed at a different rate than one whose position varies — even though both appear
exactly once per boot.

The consumption arithmetic is the whole story, and the key number is NOT the draw
count. `generateSealedBox` clears the belt cache, so **every box gets a fresh belt**.
A box calls `next()` 24 x 3 = **72** times — but when the UC3 slot is upgraded,
`boosterPack.ts` calls `UncommonBelt.putBack()`, which returns the card to the FRONT
of the hopper (physically right: the upgrade came off a different sheet, so the UC
sheet never advanced). Measured **8.64 putbacks per box**, so the belt only ADVANCES

    72 - 8.64 = 63.36 positions per box

against a boot of ~66.5 cards (60 distinct + ~6.5 woven echoes). **That advance, not
72, is the horizon.** A card placed past index ~63 in the boot is simply never reached
before the belt is thrown away. Pool check: 63.36 / 60 = 1.056 net appearances per
card per box, against 1.059 measured.

That is a real bug this repo shipped. `buildInterleavedSequence` picked strictly the
largest remaining aspect group, so an aspect holding only ONE card never became
"largest" until the very end and was placed at boot index 58-59 of 60 **every single
time** (measured over 3000 fresh belts: min 58, max 59). ASH has exactly one
Heroism-primary and one Villainy-primary uncommon out of 60, and both were
short-printed — 121 and 164 appearances against a pool mean of 263.1 over 250 boxes,
i.e. **8.7σ and 6.1σ** low (σ = sqrt(mean) = 16.2).

Fixed by choosing among eligible aspect groups at random, weighted by remaining
count, with a feasibility guard: an aspect holding more than `ceil((remaining-1)/2)`
must be placed now, else alternation becomes impossible. That guard is the only thing
largest-first was really enforcing; the fixed ordering it also imposed was the bug.

Result: per-card sd **23.0 -> 4.1** (variance 31x tighter), max/min **2.29 -> 1.08**,
worst card **8.7σ -> 0.51σ**. Note the healthy signature is SUB-Poisson: sd 4.1
against a Poisson floor of 16.2 is what a sheet should look like; the pre-fix sd of
23.0 was 1.4x Poisson, which is the tell that something structural, not sampling, was
wrong.

**Why it was a 2x hit and not a 5% one — the numbers collided.** Its fixed index was
**62.8**; the horizon is **63.36**. The card sat exactly on the cliff edge, so it was
reached in only **59.5%** of boxes: 0.537 net appearances/box against a pool mean of
1.056, i.e. ~51%. Had the pin been at index 55, or the UC3 upgrade rate a little
lower, the same bug would have been invisible.

Two consequences worth carrying:

- **The horizon moves when unrelated rates move.** Raising the UC3 upgrade rate
  increases putbacks and pulls the horizon in, silently starving whatever sits near
  it. There is no safety margin: 63.36 of a ~66.5-card boot means the last ~3 boot
  positions are never reached in a fresh-belt box. With random placement that is
  fair (every card has the same ~5% chance of landing there in a given box) — it
  only bites when something is placed there DETERMINISTICALLY, which is exactly the
  failure above. `printerDistribution.test.ts` is the guard.
- **Fill lazily, not eagerly.** `_fillIfNeeded` used to top the hopper back up to a
  full boot, so a fresh belt built an entire second boot after ~7 draws and then
  threw it away: 69.5 of 132.8 cards built per box were never served (**52.3%**).
  It now fills only when the hopper is empty — 8.7 of 72.1 (**12.1%**), and the
  persistent-belt pod path went 1.5% -> 0.4%. Serving ORDER is untouched (all 9
  collation metrics in band), because a boot that was never reached cannot affect
  what was.
- **Commit 7b6a96a6's message was wrong** and is superseded. It blamed a UC3 phase
  lock via `60 ≡ 0 (mod 3)`. Measured UC3-slot share for the two cards was
  36.2%/35.7% against a pool mean of 33.4% — about 1% of the deficit, not 32%. The
  slot a card lands in was never the issue; whether it was reached at all was.

- Ordering rules must enforce a CONSTRAINT, never impose a fixed position.
- `src/qa/printerDistribution.test.ts` guards this: every card within 6σ of its
  rarity-pool mean, σ = sqrt(mean).

## Pack Slot Indices (they differ by block — check before indexing a pack)
- **Sets 1-6**: `0` leader · `1` base · `2-10` commons · `11-13` uncommons · `14` R/L · `15` foil
- **LAW+ (Set 7+)**: `0` leader · `1` base · `2-10` commons (`6` = the guaranteed HS
  common, common slot 5) · `11` Hyperspace Foil · `12-14` uncommons (`14` = UC3) · `15` R/L
- LAW+ matches the physical pack order transcribed from real ASH box 001
  (`plans/ASH_COLLATION_FINDINGS.md`): pos12 is the foil, pos16 is the rare.
- Using the Sets 1-6 indices on a LAW+ pack silently measures the wrong slot — it
  hid 3 failing assertions in `hyperspaceDistribution.test.ts`.

## Rare Slot Rule
- The R/L slot is NEVER upgraded to Hyperspace variant (index 14 Sets 1-6, index 15 LAW+)
- Hyperspace rares/legendaries ONLY appear via UC3 upgrade (slot 3 uncommon -> random HS R/L from belt)
- The `HyperspaceUpgradeBelt` has no `rare` slot — only: leader, base, common, uc1, uc2, uc3

## Pack Structures
- **Standard**: Orchestrated by `boosterPack.ts`, 16-card packs
- **Carbonite Pre-LAW**: [0] Leader HS, [1-4] Common Foil x4, [5-6] UC Foil x2, [7] R/L Foil, [8] Prestige, [9-11] Common HS x3, [12] UC HS, [13] R/L HS, [14-15] HSF x2
- **Carbonite LAW+**: Tiered slot architecture — see `carboniteConstants.ts`

## ALWAYS Run Full QA After Any Change
After ANY change to belts, boosterPack.ts, upgrade logic, or pack structure:
```bash
npm run test && npm run qa
```
NEVER commit pack generation changes without seeing all QA and unit tests pass.
