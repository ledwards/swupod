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
