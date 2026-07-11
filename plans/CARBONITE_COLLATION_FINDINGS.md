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

### OPEN-3 — RETRACTED (leader-prestige gap was a DB number-collision artifact)

Earlier read of one pack suggested a LEADER prestige (Grogu #804) the generator can't
emit. **False.** `cards.json` has a number collision: the Leader "Grogu / Charming
Companion" and the Legendary Unit "Grogu / Yes. Yes. Yes." share collector numbers
(both list Hyperspace #419 and Standard Prestige #804). The physical cards pulled are
the **Legendary Unit** Grogu (2/6 Force-Droid), not the leader. Across all 12 box
packs, **0 prestige cards are leader-type** — the generator's `!isLeader` prestige
filter is correct. (Minor DB hygiene note: the two Grogu entries' duplicate numbers
are worth cleaning up, but they don't affect generation.)

### 📦 Boxes 001–004 — 48 ASH carbonite packs (pull-order), the real calibration data

`data/real-boxes/ash-carbonite-box-00{1,2,3,4}.csv` — a full CASE (4 boxes × 12 packs,
photos IMG_3978–4033), laid in **pull order** (front→back = left→right, top→bottom).
Every card decoded by collector number and looked up in `cards.json` (number is
authoritative; names alone are ambiguous — many leaders share a name+number with a
unit). **All 768 numbers land in their expected treatment band (0 violations)** —
strong internal consistency. Run: `npx tsx scripts/analyze-carbonite-corpus.ts`.

**Uniform structure, 48/48:** `pos1 Leader(HS) · pos2–9 HS×8 · pos10 Prestige · pos11–16 HSF×6`.
Slot COUNTS match the generator (leader + prestige + 8 HS + 6 HSF). The generator gets
the prestige POSITION and several RATES wrong — see theses.

**Ordering is real and strong (answers OPEN-4), 48 packs:**
- HS run ascends by rarity **48/48** (commons → the R/L "top" at pos 9; rarest-is-last 45/48).
- HSF run descends **42/48** (elevated card at pos 11 → commons; rarest-is-first 42/48).
- ⇒ the "hits" (HS-top pos9, Prestige pos10, HSF-top pos11) **cluster in the middle**.
  Observed collation rank order is `C < U < Special < Rare < Legendary`.

**Rates (the numbers we were guessing) — n=48:**
| block | observed /pack (n=48) | generator spec /pack |
|---|---|---|
| HS (8) | C 4.79 · U 1.88 · R 0.92 · S 0.21 · L 0.21 | C 4.96 · U 1.89 · R 0.69 · S 0.23 · L 0.23 |
| HS non-common count | always **3 (38pk) or 4 (10pk)** | 1–4 (wider, 3 random flex) |
| HS **top** (pos9) | **R 38 · L 10 · S 0 · C 0 · U 0** (≈R79/L21) | spec R60/**S20**/L20 |
| HSF (6) | C 3.90 · U 1.48 · R 0.40 · S 0.13 · L 0.10 | C 3.72 · U 1.76 · R 0.40 · S 0.06 · L 0.06 |
| HSF first (pos11) | **never Common** (U 24 · R 19 · L 5 ≈ U50/R40/L10) | flex can be Common |
| Prestige tiers | **Std 32 · Foil 15 · Ser 1 (67/31/2)** | 80 / 18 / 2 |
| Leader showcase | 0/48 | 1/48 (✓, consistent) |

**Cross-treatment pairs confirmed (validates the dedup fix):** same card in two
treatments within one pack occurs naturally — Unsanctioned Patrol HS+HSF (pack 5),
Preparation HS+HSF (pack 8), Shin Hati Prestige+HSF (pack 6), Ant Droid HS+HSF
(pack 11). The FIX-1 dedup keys on treatment, so it allows these and only forbids
identical printings — exactly matching reality (0 identical-printing dups in 12 packs).

**All 72 HSF cards are genuine `Hyperspace Foil` printings (529–766)** — real evidence
for OPEN-1 reading (b): LAW+ HSF slots should draw the real HSF variant, not synthesize
Hyperspace + flag.

### 🎯 Change theses from Box 001 (ranked; retune when box 002+ arrives)

- **T1 — Move the prestige slot from index 1 → after the HS run (pos 10).** 12/12.
  Reorder generator output to `leader, 8×HS, prestige, 6×HSF`. High-confidence, trivial.
- **T2 — Emit each run rarity-sorted: HS ascending, HSF descending** (hits in the middle).
  Do it as belt/collation emission order, NOT a post-hoc dedup-style reorder (belt rule).
- **T3 — HS top slot (pos9) is R/L only, no Special.** n=48: R 38 / L 10 / **S 0**.
  Retune `hsTopWeights` R60/S20/L20 → **{Rare: 79, Legendary: 21}** (drop Special — it
  appears only as a mid-run flex upgrade, 0/48 in the top).
- **T4 — Tighten the HS flex so non-common count stays 3–4** (n=48: 3→38pk, 4→10pk;
  never 2 or ≥5). Model HS as ~5C + 2U + 1 R/L-top with a ~20% single-upgrade, not 3
  fully-random flex draws (which spread commons 4→7).
- **T5 — Guarantee one ≥Uncommon HSF slot at pos 11** (never Common in 48; U 24 / R 19
  / L 5 ≈ **U50/R40/L10**). Add an HSF "top" at pos 11; the other 5 HSF ≈ 4C + 1 elevated.
- **T6 — Prestige tiers are ~67/31/2, NOT 80/18/2.** n=48: Std 32 / Foil 15 / Ser 1.
  Serialized is nailed at 2%; Foil is ~31% not 18%. Retune `prestigeTierWeights` →
  **{tier1: 67, tier2: 31, serialized: 2}**.
- **T7 — Belt model verdict (Lee's question):** the tight non-common counts, the
  guaranteed R/L-top + ≥U-HSF slots, and the clean rarity-sorted runs point to a
  **structured collation** (dedicated rarity slots + light upgrade layer + sort) — i.e.
  the "same belts as regular boxes" thesis. NOT random mixed-rarity carbonite sheets.
  Keep the slot-belt architecture; fix ordering (T1/T2) + guaranteed slots (T3/T5) +
  flex tightening (T4).

### ✅ Shipped (ASH-only, per-set overrides — LAW untouched)

Carbonite rates are **per set** (LAW ≠ ASH — LAW e.g. has no guaranteed R/L HS top).
Implemented as `CARBONITE_SET_OVERRIDES` + `getCarboniteConstants(setCode)`; every
non-ASH set keeps `CARBONITE_CONSTANTS`. Red-green in `carboniteBoosterPack.test.ts`
(incl. LAW-unchanged guards); per-set QA in `carboniteDistribution.test.ts`.
- **T6 shipped** — ASH `prestigeTierWeights → {tier1:67, tier2:31, serialized:2}`
  (verified 67.2/30.9/2.0; LAW stays 80/18/2).
- **T3 shipped** — ASH `hsTopWeights → {Rare:79, Legendary:21}`, and the ASH hs-top
  slot's rarities drop Special entirely (the belt floors each in-pool rarity to ≥1
  copy/boot, so weight-0 alone leaked ~0.8% Special — had to exclude the rarity, not
  just zero its weight). ASH top now 0 Special; LAW top still R60/S20/L20.

**ASH layout rebuilt (T1, T2, T4, T5) — `ASH_CARBONITE_LAYOUT` + a dedicated ASH branch
in `generateCarboniteBoosterPack` (LAW keeps its flat branch untouched):**
- **T1 shipped** — prestige emitted at pos 10 (index 9), after the HS run. 20k/20k.
- **T2 shipped** — HS run sorted ascending (100%), HSF run: dedicated ≥U top at pos 11
  then the rest sorted descending (~94%, matching the real ~88% — the non-descending
  packs are top=U followed by a Special, exactly as observed).
- **T4 shipped** — HS modelled as 4 Common + 1 swing(79% C / 21% elevated) + 2 elevated
  (`{U85,S10,R5}`) + 1 top. Reproduces the marginals (C 4.79 · U 1.88 · R 0.90 · S 0.22
  · L 0.21) AND the tight non-common count 3 (79%) / 4 (21%) — never 2 or ≥5.
- **T5 shipped** — HSF has a dedicated top at pos 11 `{U50,R40,L10}` (never Common),
  then 3 Common + 2 flex `{C45,U49,S6}`. Marginals C 3.90 · U 1.48 · R 0.40 · S 0.12 · L 0.10.
- Within-pack treatment dedup (FIX-1) preserved through the new draws (0 identical dups).
- Note: the generic `scripts/carbonite-benchmark.ts` measures the flat LAW+ spec, so its
  ASH rows are now superseded by `scripts/analyze-carbonite-corpus.ts` (ASH vs real data).
  Red-green + LAW-unchanged guards in `carboniteBoosterPack.test.ts`; QA is per-set.

### 🧭 Box-fill interleave (Lee's 6,12,5,11,4,10,3,9,2,8,1,7 theory) — NOT supported

Tested over all 4 boxes: shared HS/HSF card names between fill-adjacent pack pairs =
**0.477/pair** vs all-pairs baseline **0.515** (box-order-adjacent 0.432, same-row
0.500 — all equal; the high-sharing 3–5 pairs are NOT fill-adjacent). No factory-line
duplicate clustering — carbonite duplicates spread uniformly across pack pairs. So
**no box-stacking model is needed for carbonite** (matches Lee: cross-pack order
matters much less here than in regular boxes).

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
