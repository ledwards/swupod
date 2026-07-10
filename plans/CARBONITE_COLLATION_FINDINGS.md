# Carbonite Pack Calibration — Findings & Changes

Living record of the carbonite generator-vs-spec audit (July 2026), mirroring the
rigor of `plans/ASH_COLLATION_FINDINGS.md`. **Carbonite has no real-box ground
truth** — it is an app-only pack type (Chaos Sealed / Chaos Draft), so ground truth =
the documented design spec (`plans/CARBONITE_PACK_PLAN.md` + `src/utils/carboniteConstants.ts`
+ belt-class comments). Every claim below is re-derived from a real run of
`generateCarboniteBoosterPack`, not from the plan's prose.

**Harness:** `scripts/carbonite-benchmark.ts` (model: `scripts/collation-benchmark.ts`).
20,000 packs/set × {JTL, LOF, SEC, LAW, ASH}-CB. Baseline: `docs/carbonite-benchmark-baseline.md`.
After: `docs/carbonite-benchmark-after.md`.

**Entry point:** `generateCarboniteBoosterPack(compositeCode)` in
`src/utils/carboniteBoosterPack.ts`; belts `CarboniteSlotBelt`, `CarboniteFoilRLBelt`,
`CarbonitePrestigeBelt`, `HyperfoilBelt`. Carbonite belt instances are cached in a
`carboniteBeltCache` **separate** from the standard `beltCache` in `boosterPack.ts`, so
any carbonite-only change to belt hopper state cannot affect standard packs.

---

## ✔️ Model confirmations (generator matches spec)

Re-derived from the 20k/set baseline run:

- **Pack size** exactly 16 for every set/variant (0 short packs in 100k packs).
- **Slot 0** is always a leader, always Hyperspace or Showcase (100k/100k).
- **Prestige** exactly 1 per pack, always a valid prestige variantType
  (`Standard/Foil/Serialized Prestige`), `isPrestige` set.
- **Showcase-upgrade rate**: pre-LAW 5.0% (spec 1/20), LAW+ ~2.1% (spec 1/48).
  All 18 leaders in every set have a Showcase variant, so the roll never silently
  degrades to HS — observed rate == coin-flip rate.
- **Prestige tier mix** 80 / 18 / 2 — measured tier1≈80.3%, tier2≈17.9%, serialized≈2.0%
  (independent per-tier hoppers; roll is unbiased).
- **Weighted R/S/L slots hit target** (the `MIN_COPIES=10` scaling makes `baseScale`
  large enough that `Math.max(1,round())` flooring does NOT distort):
  - R/L Foil (pre-LAW slot 7) & R/L HS (slot 13): **70 / 20 / 10** (Rare/Special/Legendary) ✓
  - LAW+ HS-Top (slot 9): **60 / 20 / 20** ✓, always R/S/L (0 forbidden rarities).
  - LAW+ HS-block (slots 2–9) aggregate ≈ 62% C / 24% UC; HSF-block (10–15) ≈ 62% C / 29% UC —
    both match the spec-derived 4C+3flex+1top / 2C+4flex composition.
- **Source-pool mapping** (per spec "foils synthesized from Normal source, HS from HS source"):
  - Pre-LAW Common/UC Foil slots: variantType `Normal` + `isFoil` (synthesized) ✓
  - All HS slots: variantType `Hyperspace` ✓
- **No Normal-only cards** and **no wrong-set cards** in any slot (100k packs).
- **Composite-code routing** (`{SET}-CB` → base set pool, `setNumber>=7` → LAW+ layout)
  works for all 5 supported sets; unsupported sets throw.

---

## 🐛 Drift / bugs found (re-derived from runs)

### FIX-1 — Identical-printing duplicates within a pack  ✅ FIXED (red-green)

**Observed (baseline, 20k packs/set; identical *treatment* = same card + same
foil/hyperspace treatment — cross-treatment HS+HSF-of-same-card is NOT counted, it's
a legit realistic pair):**

| Set group | Whole-pack identical-printing dup | of which same-belt | of which cross-belt-within-block |
|---|---|---|---|
| LAW (20k) | **12.5%** (2500) | 5.4% (1083) | ~7.1% |
| ASH (20k) | **12.4%** (2478) | 5.4% (1079) | ~7.0% |
| JTL / LOF / SEC | 0.64% / 0.52% / 0.59% | same as whole-pack | 0.00% |

Same-belt breakdown (baseline):
- LAW+ HSF-flex slots [10–13] (one belt, 4 draws): ~3.0% · HS-flex [6–8] (one belt, 3 draws): ~2.2%
- pre-LAW HSF [14–15] via HyperfoilBelt (weighted, 2 draws): 0.5–0.66% · single-rarity groups (boot-boundary): <0.1%

(An earlier ad-hoc probe reported ~32% for LAW+ by keying on card id alone — that wrongly
folded in cross-treatment HS+HSF pairs of the same card, which are allowed. The
treatment-aware rate is 12.5%.)

**Root cause.** Multi-draw carbonite slots pull N cards from belts with **no
within-pack dedup**. Two mechanisms:
1. *Same-belt* — a weighted belt's boot holds many copies of a card (e.g. an Uncommon
   HS at quantity 210/boot), so consecutive draws for slots [6–8]/[10–13] can repeat it.
2. *Cross-belt (LAW+ only, the big one)* — the HS block is split into three belts
   (`hs-common` fixed-Common, `hs-flex` weighted, `hs-top` R/S/L) all drawing the **same
   Hyperspace pool**; the HSF block similarly (`hsf-common` + `hsf-flex`). Independent
   belts collide on the identical printing ~7% of the time. Pre-LAW never hits this
   because its slots use disjoint source-variants (Normal-foil vs Hyperspace) and
   disjoint rarities, so two pre-LAW belts can't emit the identical treatment.

**Why it's a bug.** `belt-system.md`: "Only same-belt duplicates indicate a bug."
Real-box evidence (`ASH_COLLATION_FINDINGS.md`): within-pack dups in real packs were
**ALL cross-*treatment* (Normal + its own HS/HSF); zero same-*treatment* dups.** A
premium "every card is a distinct variant" pack should never contain the identical
printing twice.

**Fix.** Pack-level placement dedup in `carboniteBoosterPack.ts`, keyed by **treatment**
(`id|variantType|isFoil|isHyperspace`) across all deck slots (leaders/prestige excluded —
they can't collide). On an identical-treatment collision the duplicate is rotated back
onto its **source belt** (no exclusion — once-per-boot preserved) and that same belt is
redrawn, so each slot's rarity/variant contract is preserved exactly. Cross-*treatment*
pairs (a card's HS + its HSF, or Normal-foil + HS) remain allowed — different key —
matching the real-box rule. Carbonite-only; standard packs use separate belt instances
and are byte-identical (proved: `npm run qa` + full unit suite green, no standard file touched).

Test: `carboniteBoosterPack.test.ts` — `FIXED: no identical-treatment dup within a pack`.

---

## ⚠️ Open findings (flagged, NOT changed — need Lee's call)

### OPEN-1 — LAW+ HSF slots carry `variantType:'Hyperspace'`, not `'Hyperspace Foil'`

Measured: pre-LAW HSF slots [14–15] (via `HyperfoilBelt`) emit the **real
`Hyperspace Foil` variant** (100% of 40k). LAW+ HSF slots [10–15] (via `CarboniteSlotBelt`
with `sourceVariant:'Hyperspace'` + `{isFoil,isHyperspace}` flags) emit
`variantType:'Hyperspace'` (0% true HSF, 120k). LAW/ASH have **238 real HSF cards**
(incl. 100 Common HSF) in the data, so this is a *choice*, not a data gap.

Two internally-consistent readings — this is a genuine design fork, so **not touched**:
- **(a) Synthesis-by-flag** (the codebase's dominant pattern; the task's own criterion
  "foils synthesized from Normal source, HS from HS source"): a foil = base printing +
  `isFoil`. Under this, LAW+ HSF = Hyperspace + flag is *correct*, and pre-LAW's use of
  the real HSF variant is the outlier (it reuses the pre-existing standard-pack `HyperfoilBelt`).
- **(b) Real-variant**: HSF printings exist (distinct collector numbers/art), so use them.
  Under this, LAW+ HSF cards carry the wrong collector number (HS #, not HSF #) and the
  two layouts should be reconciled to both draw the real `Hyperspace Foil` variant.

Recommendation: decide which philosophy is canonical and make both layouts consistent.
Fix for (b) is one line each: `LAW_HSF_FLEX_CONFIG`/`LAW_HSF_COMMON_CONFIG`
`sourceVariant: 'Hyperspace' → 'Hyperspace Foil'` (Common HSF exists, so fixed-Common
slots still fill).

### OPEN-2 — `CarbonitePrestigeBelt.next()` can return `null` for a set missing a tier (latent)

If a set ever has real prestige cards for some tiers but not others (`useSynthesis=false`
but a rolled tier's pool is empty), `next()` falls back to `_drawSynthesized`, which reads
`_synthFillingPool` — populated **only when `useSynthesis=true`**. So it returns `null` →
the pack silently ships 15 cards. **Not live**: all 5 current sets have all three prestige
tiers populated, so it never triggers today. Latent robustness gap; would surface for a
future set with partial prestige data. Cheap hardening: in `next()`, if the rolled tier is
empty, fall back to a *populated* tier's hopper before `_drawSynthesized`.

---

### OPEN-3 — Real carbonite prestige slot can hold a LEADER prestige; generator excludes leaders

Surfaced by real pull data (`data/real-boxes/ash-carbonite-001.csv`, n=1): an ASH
carbonite pack's prestige slot held **Grogu (Charming Companion, Rare Leader),
Standard Prestige #804**. But `CarbonitePrestigeBelt._initialize` builds every tier
pool with `!c.isLeader && !c.isBase`, and the synthesis fallback likewise — so the
generator can **never** emit a leader prestige. If real carbonite prestige includes
leader prestiges, drop the `!c.isLeader` filter from the prestige pool (leaders DO
have Standard/Foil/Serialized Prestige printings in the data). Confirm with more packs
before changing — n=1 — but it's a concrete, code-verifiable gap.

### OPEN-4 — Possible intra-block rarity ordering (Lee hypothesis, unconfirmed)

Hypothesis: within a pack, the HS run and HSF run may come off the sheet in ascending
or descending **rarity** order (a collation pattern). The generator draws each block
slot as an independent weighted pull, so it emits **no** intra-block ordering. Can't
be tested yet — pack 001 was laid grouped, not in pull order. Needs `pullOrder=true`
photos (cards laid in exact pull order). `scripts/analyze-carbonite-corpus.ts` has an
ordering pass (rarity- and number-monotonicity per block) that activates once such
packs exist. If confirmed, model it as **belt emission order**, not a post-hoc sort
(belt-system.md forbids reordering passes) — design discussion first.

### 🎴 Corpus + first real data point (ash-carbonite-001)

One real ASH carbonite pack, decoded via collector-number ranges (`Normal ≤264 · HS
265–528 · HSF 529–766 · Showcase 767–784 · Prestige 785–925`) and cross-checked
against `cards.json` (all 16 numbers confirmed exactly). It is a **textbook LAW+
pack**: 1 HS leader + 1 prestige + 8 HS + 6 HSF. Block rarity mix (HS: 4C/1U/2R/1S;
HSF: 4C/2U) sits inside the assumed weights. All 6 HSF are genuine `Hyperspace Foil`
printings (529–766) — direct evidence for OPEN-1 reading (b) (use the real HSF
variant, don't synthesize from Hyperspace source). Harness: `scripts/analyze-carbonite-corpus.ts`;
schema/protocol: `data/real-boxes/README.md`. Once ~15–20 packs are logged, retune the
flex/top/prestige/showcase weights (currently guesses) against the corpus.

## 📋 Spec-doc drift (flagged per "trust code over docs")

`plans/CARBONITE_PACK_PLAN.md` is **stale** vs the code (code is ground truth):
- Its LAW+ table says `[2-9] HS non-foil x8` + `[10-15] HSF x6` (flat). The actual code
  (`carboniteConstants.ts`) is **tiered**: `[2-5] 4×fixed-Common HS`, `[6-8] 3×flex HS`,
  `[9] 1×top R/S/L HS`, `[10-13] 4×flex HSF`, `[14-15] 2×fixed-Common HSF`.
- Its `Constants` block omits `hsFlexWeights`, `hsTopWeights`, `hsfFlexWeights` and lists
  a defunct `hsNonFoilWeights`.
- `supportedSets` in code is `[JTL, LOF, SEC, LAW, ASH]` (plan omits ASH; Status says
  "Complete" — do not trust). `showcaseRate`, `prestigeTierWeights`, `foilRLWeights`
  all match. Plan doc should be refreshed to the tiered LAW+ structure.

---

## 🎯 Summary (numbers)

- **Confirmed in-spec:** pack size, leader HS/showcase, showcase rate (5% / 2.08%),
  prestige tier mix (80/18/2), all weighted-slot rarity distributions (70/20/10, 60/20/20),
  LAW+ block aggregates, source mapping, no Normal-only/wrong-set cards.
- **Fixed:** identical-printing within-pack dups — LAW+ 12.5%→0, pre-LAW ~0.6%→0
  (rates + all distributions unchanged post-fix: showcase 4.8–5.0%, tier1 ~80%,
  R/L foil ~70%, HS-block Common 61.9% — dedup redraws from the same belt so contracts hold).
- **Flagged (no change):** LAW+ HSF variantType (0% real HSF — design fork), prestige
  latent null (not live), stale plan doc.
