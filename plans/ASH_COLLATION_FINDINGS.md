# ASH Real-Box Collation Findings & Changes

Working checklist for improving the collation algorithm using real ASH box data.
Source: one real ASH booster box (24 packs) opened in order, photographed June 2026,
transcribed card-by-card via printed collector numbers.

**Data:** `tmp/ash-box-contents.csv` (384 rows, pack + layout order) · per-pack JSONs
in `tmp/ash-box-results/` · sim scripts `tmp/sim-ash-box.ts`, `tmp/sim-ash-dups.ts`,
`tmp/sim-pool-pairs.ts` (all untracked).

**Physical pack order (consistent all 24 packs):** pos1 leader · pos2 base ·
pos3–11 commons (pos7 = common slot 5 = the guaranteed HS common) · pos12 foil ·
pos13–15 uncommons (pos15 = UC3) · pos16 rare/legendary.

**Transcription reliability tell:** normal cards print `N/264`; hyperspace/prestige
variants print a bare number, no denominator (HS 265–528, HS foil 529–766,
showcase 767–784, prestige 785–925). pack04's photo is blurry — IDs are
art/frame-matched, least certain pack.

---

## ✅ Changes made (code)

- [x] **UC1/UC2 never upgrade to HS for Set 7+** (user-confirmed spec: UC3 is the
      only UC upgrade slot for LAW and ASH; real box observed 0/48 at a modeled 1/8,
      P≈0.002).
      - `HS_BELT_CONFIGS['LAW']`: `uc1: 0, uc2: 0`, budget `{0:26, 1:28, 2:6}` (=40/cycle)
      - `SET_7_PLUS_CONSTANTS.uncommonHyperspaceRate`: 1/8 → 0
      - `HyperspaceUpgradeBelt._fill`: added augmenting-swap repair — the tighter
        config made random slot assignment infeasible ~97% of the time (stranded
        budget-2 capacity, cycles shipped 4-6 upgrades short). Repair preserves the
        random distribution; sets 1–6 unaffected. Verified exact quota over 500
        cycles per set group.
      - Red-green test in `HyperspaceUpgradeBelt.test.ts`; full unit suite + `npm run qa` pass.
      - Post-fix: 4.5 HS uncommons/box (was 7.0); real box: 5. ✓
      - NOT YET COMMITTED.

## 📋 Recommendations (not yet applied)

- [ ] **Foil slot rarity weights**: observed C20/U1/R1/S1/L1 in 24 foils vs model
      C65/U20/R8/S4/L3 (expected C15.6/U4.8/R1.9/S1.0/L0.7). Common +1.9σ,
      Uncommon −1.9σ, R/S/L on target. Recommend `C72/U13/R8/S4/L3` as an ASH
      override (moderate shift, don't chase one box to C83/U4). Second box settles it.

## ✔️ Model confirmations (real box matches generator)

- [x] Foil slot is 24/24 Hyperspace Foil — **standard-frame foils do not exist in
      ASH** (user-confirmed product fact; any "standard foil" transcription read is
      an OCR error).
- [x] HS leader rate 4/24 = 1/6 exactly (model 1/6).
- [x] HS base 2/24 (model 1/6 → expect 4; within noise for 24 packs).
- [x] Guaranteed HS common: exactly 1/pack in 22 packs, always at common slot 5
      (pos7) — matches `hyperspaceCommonSlot: 5`. Two packs (04, 12) had a second
      HS common elsewhere (model produces 2 in ~5% of packs ✓).
- [x] UC3 outcomes: 16 normal UC / 5 HS-UC / 2 HS-Rare / 1 Standard Prestige =
      exactly 1/3 upgrade rate, rarity mix consistent with UC24:R12:S3:L1 weights.
- [x] Rare slot 19R/5L ≈ 5:1 (model `rareSlotLegendaryRatio: 5`).
- [x] Prestige 1/box (model 1/12/pack ≈ 2/box; P(≤1)=0.41, fine).
- [x] Showcase 0 (model 1/576/pack ≈ 0.04/box).
- [x] **Within-pack duplicates**: real 3/box, ALL cross-belt variant pairs
      (normal + its own HS/HS-foil printing); zero same-variant dups. Generator:
      3.7/box with the same composition (HS+Normal 2.0, HSFoil+Normal 1.4, ~0
      same-variant). Rate and composition match.
- [x] **Box-level duplication**: real 183 unique non-leader/base names
      (1x 42% / 2x 36% / 3x 19% / 4x 3.3%, max 4) vs generator 183.2 ± 2.6
      (38/43/17/2.2%). Dead on.

## ⚠️ Open findings (real box diverges — candidate algo improvements)

- [ ] **Pool-level dup clustering**: duplicate pairs cluster within consecutive-6-pack
      windows in the real box — pairs per pool 13/6/4/10 (mean 8.25) vs generator
      5.5 ± 1.7; AND the real box never put any name at 3+ copies within a pool
      (generator: ~15% of pools have one). Same total dup mass, different spatial
      distribution: real print runs put repeats near each other, pairwise, without
      pile-ups. Candidate lever: shorten effective repeat distance in common belts
      (cycle/boot size), while keeping the 3+-in-6-packs suppression. Needs design
      discussion + ideally a second box.
- [ ] **Adjacent-pack repeats observed**: pack01/pack03 have the same leader (Shin
      Hati) AND same rare (One Must Destroy to Create, #247), two packs apart.
      Leader spread across box: max 3x (4 leaders at 3x, 4 at 2x, 4 at 1x from 18
      leaders). Check our LeaderBelt/RareLegendaryBelt seam behavior against this.
- [x] **Aspect/aspect-combo rotation audit** — done, see section below.

---

## 🧭 Aspect & Rotation Audit (belt rules vs real box)

### Confirmed by real data ✅

- **Common A/B lanes (Block B / LAW+)**: real box pos3–6 = 76/96 Vigilance/Aggression-primary
  (+19 Villainy-only/neutral, 1 crossover) and pos8–11 = 77/96 Command/Cunning-primary
  (+18 Heroism-only/neutral, 1 crossover). Matches `CommonBelt` Block B exactly:
  Belt A drawSize 4 requiring ≥1 Vig ≥1 Agg, Belt B drawSize 4 requiring ≥1 Cmd ≥1 Cun
  (CommonBelt.ts:100-113), Villainy-only→A / Heroism-only→B (commonBeltAssignments).
  **Lane architecture is right.**
- **Common aspect interleaving**: real adjacent same-primary = 2/168 pairs among normal
  commons — matches CommonBelt's no-adjacent-same-primary round-robin (with rare forced
  adjacency). Per-pack balance max 2 of any primary in 22/24 packs ✅.
- **Foil belt no-dedup**: 24 real foils, 0 repeats, no aspect pattern — shuffle-only is fine.
- **Dedicated HS common belt**: 0 repeats in 24 draws, roughly balanced aspects — fine.

### Our belts are STRICTER than the real printer (over-dedup) ⚠️

Real-box repeats that our current dedup windows would forbid:

| Belt | Our rule | Real box observation (exact citations) |
|---|---|---|
| LeaderBelt | 24-pos dedup window, penalty-scored | Shin Hati #16 (Common) pack1→pack3, **gap 2, both normal-belt**; also Ahsoka Tano #9 pack9→pack15 (gap 6, both normal) |
| RareLegendaryBelt | 6-pos same-card dedup | One Must Destroy to Create #247 (Rare) pack1 pos16 → pack3 pos16, **gap 2** |
| BaseBelt | NO adjacent bases share ANY aspect (hasSameAspect, BaseBelt.ts:30-35) | 5 adjacent same-aspect pairs in the 22-base normal-belt sequence (= random rate): Throne Room→Kryze Castle [Command] p5→p6; Freetown→Observatory [Cunning] p9→p10 and p19→p20; Observatory→Freetown [Cunning] p20→p21; Dragonsnake Bog→Ancient Henge [Aggression] p22→p23. Plus Freetown #26 name repeat p19→p21 (gap 2, both normal) |
| UncommonBelt | 24-pos dedup window | Mayor's Majordomo #217 pack4 pos15 → pack6 pos15 (**gap 2 packs ≈ 6 belt draws**, both normal); Ezra Bridger #209 pack16 pos15 → pack20 pos13 (gap 4 packs ≈ 11 draws, both normal) |
| CommonBelt | 24-pos dedup ≈ min 6-pack name gap | 13 normal-normal repeats at gaps 1–5 packs, e.g. Forest Patroller #96 pack18 pos9 → pack19 pos9 (**gap 1**); Protectorate Fighter #124 pack1 pos8 → pack3 pos11 (gap 2); Gallofree Transport #254 pack17 pos8 → pack19 pos10 (gap 2); Perseverance #89 p1→p4, Ant Droid #116 p1→p4, Imperial Loyalist #239 p21→p24, Intimidation #185 p21→p24 (gap 3) |
| UncommonBelt interleave | no adjacent same primary | pack6 pos14→pos15: Nowhere to Hide #198 [Cunning/Villainy] → Mayor's Majordomo #217 [Cunning] — adjacent same-primary, both normal belt. (An earlier draft cited pack14 — that case was cross-belt [HS R5-D4 in UC3] and does NOT count; corrected.) |

This is the same signal as the pool-clustering finding: the real printer repeats things
much sooner than we allow, and bases show NO aspect-rotation constraint at all.

**Pool repeatShare — three datasets, one metric** (repeatShare = (pulls−distinct)/pulls,
6-pack pools, non-L/B, variant-agnostic; partial palmsprings fixtures excluded):
- Real LAW event pools (8 full, scripts/eval/fixtures): 4.8, 4.8, 6.0 ×5, **18.1** (prague-taylor-b)
- Real ASH box consecutive pools (4): 4.8, 7.1, **11.9**, **15.5**
- Generator: mean ~6.5%, sd ~2.0pp — never below ~3% or above ~11%

**Correct reconciliation of "ours too high (6% vs 5%)" vs "ours too low (5.5 vs 8.25
pairs)": the real distribution is overdispersed/bimodal** — a clean mode at 4.8–6.0%
(8 of 12 real full pools) and a fat clumpy tail at 12–18% (3 of 12). Our generator's
mean sits between the modes: slightly above the clean mode (the "too high" reading)
and far below the box average that includes clumpy pools (the "too low" reading).
**Our variance is ~half of reality's** — we never produce a clumpy pool (13 pairs =
+4.4σ for us; reality had 3 pools ≥10 pairs in 12).

Physical mechanism: the ASH box's short-gap repeats concentrate in packs 1–5 and
16–24 (clean middle) — duplicate-dense stretches of the print run. Event pools
sample random stretches: usually clean, occasionally clumpy (prague-taylor-b).

Pool-pair composition detail: cross-variant pairs (normal + own HS/foil) match
(generator 5.43 vs ASH-box 5.75/pool); normal+normal same-belt pairs are the entire
gap (generator 0.00 — impossible under 24-pos windows — vs ASH-box 2.50/pool,
concentrated in the clumpy pools). Within-pack dup rate is a separate, cross-belt
mechanism: generator 15.7% of packs vs real 12.5% — unconfirmable on one box.

**⚠️ SUPERSEDES the uniform window-shrink proposal (Phase 2 items 3–6 above):**
uniformly smaller dedup windows raise EVERY pool's dup rate — pushing the clean mode
from ~6% to ~8%+ (worse on the "already too high" axis) while still not producing
the 12–18% tail. Wrong shape. The right target is overdispersion: keep typical pools
at/below current levels, add occasional duplicate-dense stretches (e.g. a belt
mechanism that sometimes re-serves a recent region — a "sheet-cut echo" — a few
packs long). BaseBelt aspect-dedup removal (item 7) still stands on its own evidence.
Needs design discussion; ideally a second ASH box + more event fixtures first.
Design question: match reality (looser windows → more short-gap repeats, better pool
"pairs" realism) vs. keep curated feel. Candidate experiments:
- [ ] Shrink CommonBelt dedup window (24 → ~8 positions ≈ 2 packs) and measure pool-pair
      distribution against the real 8.25/pool.
- [ ] Shrink UncommonBelt window (24 → ~6).
- [ ] Relax/remove BaseBelt aspect-adjacency dedup (real is aspect-random); keep name
      spread only.
- [ ] Reduce LeaderBelt dedup gap for common leaders (real allows gap 2).
- [ ] RareLegendaryBelt: 6-pos window vs real gap-2 repeat — consider 2-3.

### Code gaps found (independent of real-box data) 🐛

- [ ] **`tripleAspect.beltAssignment: 'primaryAspectPriority'` is configured for LAW/ASH
      but never read** — `CommonBelt.getBeltCards()` uses only the static
      `commonBeltAssignments` list; `autoAssign` exists but is off for every set. If a
      triple-aspect card is missing from the static list it silently drops or misroutes.
      Add validation that every common in the set has a belt assignment + primary aspect
      matches expectation.
- [ ] No aspect logic at all in RareLegendaryBelt / HS R-L / Foil / Hyperfoil / HS
      Uncommon / HS Common belts — **real-box data says this is actually CORRECT**
      (rare slot & foil slot show no aspect rotation IRL). Do NOT add interleaving there;
      document it as intentional instead.
- [ ] Seam-dedup recursion `depth > 10` bailouts in RareLegendaryBelt /
      HyperspaceRareLegendaryBelt can silently leave dupes (edge-case).
- [ ] No automated test asserts the CommonBelt segment quotas (≥1 Vig ≥1 Agg per A-segment
      etc.) hold post-boot; interleaving is validated only implicitly.
- [ ] Villainy/Heroism handling is implicit: CommonBelt treats them via aspects[0]
      fallback for mono-morality cards (13 Villainy-only + 12 Heroism-only commons in
      the real box split correctly A/B). Document the intended rule.

---

## 🤝 Prior-model handoff integration (July 2026)

An earlier analysis (OpenAI model) hypothesized the generator **overproduces
duplicates vs IRL** (their IRL baseline: 4.50 dup identities / 4.67 copies-beyond-first
per sealed pool, n=6) and proposed a **cross-treatment anti-collision rule**
(suppress Normal + own HS/HSF in same pack/pool). Verdict against our data:

- **Their IRL baseline was the clean-mode subset.** Recomputed under their exact
  definitions (dup identities = names qty>1, copies = Σ(qty−1), non-L/B, full pools
  only): excluding prague-taylor-b gives 4.43/4.71 (≈ their 4.50/4.67); the FULL
  n=8 fixture set gives **5.63/6.00 vs generator 5.77/5.93 — means match**. The
  premise "generator too high" was an artifact of the sample missing clumpy pools.
- **Cross-treatment anti-collision is REFUTED** by the treatment-aware ASH box (the
  first dataset that can answer this): real cross-variant pairs 5.75/pool vs
  generator 5.43 — reality does NOT suppress Normal+HS/HSF collisions.
  Do not implement.
- **Their ASH-placeholder artifact finding stands** (placeholder names encoded
  treatment → ASH DB undercounts). Their LAW/ASH generator-equivalence stance is
  also supported by the real box.
- **Adopted from their task list:** formalize real-box data separately from scanner
  eval fixtures (data/real-boxes/, schema: box, pack, slot, identity, treatment);
  a repeatable real-vs-generated comparison script. Their /dev/collation-entry UI is
  deferred — the photo→transcription pipeline used for box 001 worked and is cheaper.

## 🎯 Adjusted recommendation series (goal: realistic 6-pack pools & 24-pack draft boxes)

**A. Do now (settled by evidence): ✅ SHIPPED 2026-07-03**
- [x] A1. UC1/UC2 fix committed (tests+QA green).
- [x] A2. ASH foil-slot weights → C72/U13/R8/S4/L3 (ASH-only override; LAW unchanged).
- [x] A3. Dead `tripleAspect` config deleted (aspects[0] priority is the actual rule
      in assignCardToBelt); belt-assignment completeness tests added for LAW/ASH.
      **Bonus fix found during implementation:** Block B lane rules corrected from
      box 001 — Heroism-only commons → Belt B (was A; box showed 11+ in lane B, 0 in
      lane A), neutral commons split across belts by collector-number parity (was
      all-B; box showed ~even split).
- [x] A4. BaseBelt (Set 7+): aspect-adjacency dedup dropped (real = random rate);
      same-name seam guard kept. Sets 1-6 unchanged, red-green tested.
- [x] A5. Box 001 formalized: data/real-boxes/ash-box-001.csv (+ README schema),
      scripts/analyze-real-box.ts (windows, dup identities, copies-beyond-first,
      same-pack collisions, source breakdown, --compare vs generator).
- [x] A6. Explicit non-changes: NO cross-treatment anti-collision; NO uniform dedup
      window shrink; LAW/ASH rule equivalence preserved.
- [x] (QA hardening) zero-rare-leader draft-box assertion made rate-based (≤2/1000):
      the ===0 invariant passed on seed luck — HS leader replacement can flip a rare
      leader to common, so P(zero-rare box) is tiny but nonzero, and any code change
      reshuffles the seeded RNG stream.

**B. The real gap — dispersion (design, then implement behind Set 7+ config):**
Real pools: clean mode 4-5 dup identities, fat tail 13-15 (~25% of pools). Generator:
narrow 5.8±1.7, produces neither extreme. Mechanism evidence: ALL of box 001's
short-gap repeats (leader Shin Hati p1/p3, rare #247 p1/p3, commons Protectorate
p1/p3, Perseverance p1/p4, Forest Patroller p18/p19, Imperial Loyalist p21/p24 …)
co-locate in packs 1-5 and 16-24 — duplicate-dense print-run stretches, clean middle.
- [ ] B1. Design "stretch echo": at boot refill, with probability p, seed the new
      boot's start with duplicates of the previous boot's last ~L cards (per-belt,
      keeps once-per-boot invariant and belt independence; mimics sheet-cut echo).
      Tunables p, L per belt type (common lanes, UC, R/L, leader).
- [ ] B2. Calibrate against: pool dup-identity distribution (mode 4-5, ~20-25% of
      pools ≥10), box unique names 183±3, within-pack dup rate unchanged (~12-16%),
      gap histograms. Validation sim + npm test + qa.
- [ ] B3. Draft-pod note: box-level totals ALREADY match reality (183 unique vs
      183.2±2.6) — 8-player drafts are realistic today; B1 adds the within-box
      stretch texture and fixes sealed-pool dispersion with the same mechanism.

**C. Data to de-risk B:** ASH box #2 (photo pipeline), treatment-aware entry for
future event pools if convenient. Two more clumpy-pool observations would pin p and L.

---

## 📦 Factory pack-order discovery (2026-07-03, box 001 re-analysis)

Lee's box theory: packs are placed in the box bottom-up in left/right pairs, so the
factory line order is photo-packs 12,24,11,23,10,22,…,1,13 (photo order = one column
top-down, then the other). Re-running box 001 under this "line order" gives **three
independent confirmations**:
1. **Shared identities**: line-adjacent pack pairs share 1.65 non-L/B identities/pair
   vs 0.39 for photo-adjacent and 0.72 for random pairs (4x signal).
2. **Bases become aspect-separated**: 1/21 adjacent same-aspect in line order
   (P≈4% if random) vs 5/21 (=random) in photo order — the base sheet DOES rotate
   aspects, on the line.
3. **Commons gap histogram collapses** from flat 3-13 (photo) to a clean short-range
   pattern: gap 1 ×32, gap 3 ×17, decaying — **a common's duplicate copies ride
   1-3 packs apart on the line, uniformly across the box** (no "dense stretches";
   that was aliasing from the column stacking).

Under line order: rare #247 repeat gap 2→4, Shin Hati leader gap 2→4 (min leader
gap 3), UC min gap 4, Freetown base repeat gap 1 (the one anomaly — adjacent same
base on the line).

**Key modeling insight**: our generator serves packs in CONSUMPTION order (players
take packs off the top of a column), so the photo-order statistics remain the right
calibration target for what players see — A4 (random base-aspect adjacency for
players) stands. But the PHYSICAL model is now clear and simple:
**line rules + box stacking**. Belts follow line rules (dup copies adjacent,
base aspects separated, leader/rare short-range spacing), then a stacking
permutation (line → two interleaved columns) maps line packs to box order.
Consumption of column runs then reproduces everything we measured for free:
random-looking base aspects, gap-2 consumer repeats, AND the clean/clumpy pool
split (line-adjacent dup pairs land in the same pool only for some grab patterns).
This **replaces the "stretch echo" Phase B design** with something simpler and
physically grounded. User confirmed proceeding on the interleave theory (2026-07-03).
**Implementation plan: `plans/LINE_STACKING_COLLATION_PLAN.md`** (test-first;
benchmark before/after; 6-box recalibration next week).

---

## 🎴 Pool 002 (6 ASH packs, transcribed 2026-07-03; data/real-boxes/ash-pool-002.csv, uncommitted)

Provenance not yet confirmed (loose packs vs box position). Findings:
- **13 dup identities / 84 pulls (repeatShare 15.5%) — a CLUMPY pool**, and
  **10 of 13 pairs are Normal+Normal** at pack distances 1-5 (3 cross-variant).
  Our generator produces 0.00 Normal+Normal pairs per pool — this single pool has ten.
  Clumpy tail is now 4 of 13 real full pools ≥10 dup identities.
- **pack06 has an HS leader AND an HS base in the same pack** (Vane #276 +
  Dragonsnake Bog #288), plus a UC3 HS upgrade — 3 belt upgrades in one pack.
  Our HyperspaceUpgradeBelt forbids leader+base co-occurrence AND caps budget at 2:
  both constraints are falsified by one real pack (our model gives this pack
  probability zero). Candidate fix when more boxes confirm: drop the co-occurrence
  constraint and allow budget-3 plans (or move to independent per-slot draws).
- Confirmations: HS common exactly 1/pack (6/6, slot 5); foil 6/6 HS-foil (C5/U1);
  UC1/UC2 upgrades still zero (cumulative 0/60 slots across 30 packs); UC3 upgraded
  3/6 (2 HS-UC, 1 HS-Rare, all at UC3); rare slot 5R/1L; within-pack dup = 1
  (Huyang normal + its own HS foil, cross-belt as expected).
- HS leaders 2/6, HS bases 2/6 (model 1/6 each — high but n=6).
- Note: pack01 was photographed in a nonstandard layout (leader at pos3) —
  structure stats for it are type-derived, not position-derived.

## ⚠️ Evidence correction (2026-07-03, post-ship audit)

Lee challenged the "pools with ≥10 dup identities" claim — and the audit found
**prague-taylor-b (14 dup identities) is UNVERIFIED machine-generated ground
truth** (`_needsHumanCorrection` flag: OCR labels never human-corrected). It is
EXCLUDED from all calibration claims. Corrected verified evidence:
- All 7 verified full event pools: 4,4,5,5,4,5,4 dup identities — **no verified
  event pool reaches 10**. Lee's recollection was right.
- Consecutive box-cut pools DO reach 10+: box 001 pool 4 (packs 19-24) = **10**
  (all high-confidence number reads), box 001 pool 1 = **13** (7 normal+normal
  pairs incl. #247 rare in packs 1&3; ~5 pairs have one leg in blurry pack 4 —
  identity via art-match, still name-reliable), pool 002 (prerelease box) = **13**
  (all number-verified).
- Corrected stats (12 verified full pools): mean 6.4 dup identities; ≥10 in
  3/12 = 25% — but the clumpy pools are ALL box cuts (3 of 5 box-cut pools ≥10)
  and the clean pools are ALL event pools (0 of 7). **Open question for the
  6-box data: are event pools not consecutive box cuts (TOs mixing packs), or
  was box 001 unusual?** Our generator cuts pods from consecutive box positions,
  so the box-cut distribution is the modeling target; 22% generated clumpy rate
  is conservative vs the observed 3/5.
- prague-taylor-b needs human correction before any future use.

## 🚨 Incident record: the July 4 clobber (resolved)

Commit `3fb886e5` ("chore(collation): land LAW/ASH collation fine-tuning",
2026-07-04 12:02, a codex-session squash) resolved its merge by taking
PRE-collation versions of every generator file — silently removing the entire
shipped line+stacking engine (stacking, paired boots, UC1/UC2=0, ASH foil
weights, line rules, lineStacking QA, benchmark scripts) from main while
keeping docs/data/release notes. Production ran the old generator 2026-07-04
→ 2026-07-07. **Restored by `13c1b41e`** (all 28 files from the collation line
tip, full gates green, benchmark back to shipped shape).

Lessons: (1) belt-file merge conflicts must resolve toward the collation side —
read this doc before any "landing" commit; (2) the lineStacking QA suite in
`npm run qa` is the tripwire — it fails loudly if the engine disappears, so
ALWAYS run qa before landing generator-adjacent merges; (3) the clobber shipped
a state where the qa script no longer referenced the deleted suite, which hid
the failure — treat package.json qa-script edits in merges as a red flag.

## 🔎 Caveats

- Single box (24 packs). All z-scores are one-box evidence.
- pack04 variant calls are frame-inferred (blurry photo), not number-read.
- Visual layout order assumed to preserve the order cards came out of the pack.

---

# 🧪 Phase 4 — 6-Box Case Recalibration (in progress, 2026-07-10)

**Dataset:** Lee's sealed case of 6 ASH boxes (distinct from box-001 "Porg Depot").
One pack per photo, removal order = left column top→bottom then right. Case removal
order also captured (left column then right) → case factory-line hypothesis
(box-level analog of the pack interleave): boxes **3,6,2,5,1,4**.

**Box ↔ case ↔ file mapping:**

| Lee box | case slot | CSV file |
|---|---|---|
| box1 | left-top | `ash-box-002.csv` |
| box2 | left-mid | `ash-box-003.csv` |
| box3 | left-bottom | `ash-box-004.csv` |
| box4 | right-top | `ash-box-005.csv` |
| box5 | right-mid | `ash-box-006.csv` |
| box6 | right-bottom | `ash-box-007.csv` |

Pipeline: HEIC→JPEG→62% overlapping quadrant crops → sonnet transcription
(number-driven) → opus verification (re-crop/re-read flagged + low-confidence;
canonicalize slots) → merge with reference cross-check (identity+variant derived
from the printed number, normalNumber by identity lookup).

## Box-002 (Lee box1) — LOCKED ✅

**Duplicate-tail: CLEAN box.** Pools (removal order) dup identities **5 / 7 / 4 / 5**;
Normal+Normal pairs **0 / 1 / 0 / 0**; 185 distinct (target 183 ✓); 4 same-pack
collisions, all cross-variant. **Zero clumpy pools** (box-001 had two: 13, 10).
→ First confirmation the clumpy tail is **box-dependent, not universal**.

**Rate confirmations (on-model):** HS leader 3/24 (p8,15,20); HS base 2/24 (p2,18);
leader+base HS co-occurrence 0; UC3 = 15 Normal / 6 HS-UC / 2 HS-Rare / 1 Prestige
(37.5% upgrade ✓); prestige 1; showcase 0; UC1/UC2 HS = 0 ✓; foil slot always HSF ✓;
2 packs with 2 HS commons (p11 #393+#340, p18 #344+#434 — verified real).

**Accumulating recalibration signals (box-001 + box-002 agree):**
- ⚠️ **Foil-slot rarity runs more common than the shipped C72/U13/R8/S4/L3.**
  box-001 foils 20C/1U/1R/1S/1L; box-002 foils 20C/4U/0R/0S/0L → combined
  **40C/5U/1R/1S/1L of 48 = 83% Common** (model 72%); R/S/L rarer than modeled.
  Both boxes independently hit 20 commons/24. Candidate: raise foil common share
  toward ~83%, lower R/S/L. HOLD exact weights for boxes 3–6 (R/S/L low-count).
- ⚠️ Rare slot R:L both boxes 19/5 = 3.8:1 (model 5:1) — mild legendary-heavy lean.
- ⚠️ 2-HS-common packs both boxes 2/24 ≈ 8% (model ~5%) — mild.

## Box-003 (Lee box2) — LOCKED ✅

**Duplicate-tail: CLEAN box.** Pools dup identities **5 / 8 / 6 / 5**; N+N pairs
0/1/0/0; 186 distinct ✓; 6 same-pack collisions, all cross-variant. Zero clumpy.
→ **Two-for-two clean case boxes** (8 pools, all 4–8, none ≥10).

**Rates:** HS leader 4/24 (p3,9,13,20) ✓; HS base 3/24 (p9,14,20) ✓; **leader+base
HS co-occurrence in 2 packs (p9, p20)** — confirms L5 non-exclusivity is real; UC3
15 Normal / 5 HS-UC / 2 HS-Rare / 1 HS-Special / 1 Prestige (37.5% ✓); 2-HS-common
1 pack (p15 #351+#506, verified); prestige 1; showcase 0.

## 📊 Cross-box rate signals (boxes 001+002+003, 72 packs) — HARDENING

Two signals are now consistent across THREE independent boxes and are strong
recalibration candidates:

- 🔴 **Foil-slot rarity: ~83% Common, not 72%.** Every box independently hit
  **20 Common foils / 24**. Combined **60C / 7U / 2R / 1S / 2L of 72** =
  C83.3% / U9.7% / R2.8% / S1.4% / L2.8% vs shipped **C72/U13/R8/S4/L3**.
  Common under-modeled, Rare (8%→3%) and Special (4%→1.4%) over-modeled.
  Candidate reweight ≈ **C83/U10/R3/S1.5/L2.5** (round after boxes 004–007).
- 🔴 **Rare slot: 19R / 5L in ALL THREE boxes** → legendary ≈ 5/24 = 20.8%,
  ratio **3.8:1**, not the shipped 5:1 (`rareSlotLegendaryRatio: 5`). Combined
  57R/15L. Candidate: ratio ≈ **3.8** (legendary share ~21%). Remarkably tight
  (3/3 identical) — highest-confidence recalibration so far.

Weaker/mild (watch across remaining boxes):
- 2-HS-common packs 5/72 ≈ 7% (model ~5%).
- Prestige 1/box every box = 3/72 ≈ 1/24 pack (model uc3PrestigeRate 1/18 ≈ 1.3/box) — mild low.
- Leader+base HS co-occurrence 2/72 (box-003 both) vs model ~1/36 — small n, but confirms it happens.

Confirmed dead-on (do not touch): HS leader ≈1/6, HS base ≈1/6, UC1/UC2 HS = 0,
foil always HSF, HS common 1/pack, UC3 ~1/3 upgrade, within-pack dups all cross-variant,
box unique identities ~185.

## Box-004 (Lee box3) — LOCKED ✅

Dup-tail CLEAN (pools 6/5/8/7, 182 distinct, 6 same-pack collisions all cross-variant)
— **three-for-three clean case boxes.** Rates: HS leader 2/24 (p2,9); HS base 1/24 (p6);
UC3 14 Normal / 6 HS-UC / 2 HS-Rare / 2 Prestige; prestige 2; 0 two-HS-common packs.
Stacking: standard interleave, 2.45x (NOT flipped).

## 🟥🟥 HEADLINE (boxes 001–004, 4/4 IDENTICAL): the rare & foil slots are PER-BOX QUOTAS, not per-pack draws

The two "rate" signals above are actually the shadow of a **structural** fact:

- **Rare slot = exactly 19 Rare + 5 Legendary EVERY box** (001,002,003,004 all 19/5).
- **Foil slot = exactly 20 Common + 4 upgrades (U/R/S/L) EVERY box** (all four = 20C+4).

Under the shipped model's **independent per-pack draws**, per-box counts are Binomial:
rare-slot legendaries ~ B(24, 1/6) = 4 ± 1.8 → P(exactly 5) ≈ 0.19, so
P(all 4 boxes = 5) ≈ **0.1%**. Foil commons ~ B(24, .72) = 17 ± 2.2 → P(all 4 = 20)
is astronomically small. **4/4 exact on two independent metrics ⇒ these slots are fed
by fixed per-box print sheets / quotas, not per-pack RNG.**

Physical model: the rare/legendary slot for a box is one print sheet with a fixed
layout of **19 R + 5 L**; the foil slot is a sheet with **20 C + 4 hits**. Each box
consumes exactly one of each → fixed counts, near-zero per-box variance.

**Implication for the generator (candidate NEW belt rule, not just a reweight):**
make the rare-slot and foil-slot COMPOSITION a per-box quota for Set 7+:
- Rare slot: guarantee exactly 5 Legendary + 19 Rare per 24-pack box (distribute the
  positions across the box, don't draw each pack independently).
- Foil slot: guarantee exactly 20 Common + 4 upgrade foils per box; within the 4
  upgrades, the U/R/S/L split is where the remaining (small) randomness lives —
  provisional pool across 4 boxes: {U:10, R:2, S:2, L:2} of 16 upgrade-foils.
This also explains why the naive "reweight to C83/3.8:1" is the right MEAN but wrong
MECHANISM — a quota nails both the mean AND the (near-zero) variance the data shows.

⚠️ CONFIRM WITH BOXES 005–007. If boxes 5/6 also show 19/5 and 20C, the quota is
locked (6/6). If any deviates, it's a tight distribution, not a hard quota — recalibrate
means/variance instead. Either way the per-pack-independent model is wrong on variance.

## 🧭 Stacking orientation by box (intra-case signal forming)
- box-002 (case left-TOP): standard interleave (2.39x)
- box-003 (case left-MID): **flipped right column** (1.97x corrected; 0.85x standard)
- box-004 (case left-BOTTOM): standard interleave (2.45x)
→ Left column orientation = std / flip / std (alternating by row?). Boxes 5–6 (right
column) will show whether case assembly alternates box orientation — a case-level
collation signature. (Model impact nil regardless; stackBoxOrder unchanged.)

(Boxes 005–007 pending.)

## 📦 Teddy's case — 4 boxes (structural/rarity pass, 2026-07-11)

Second case, 4 boxes from Teddy (unknown pull-order → NOT usable for pool/stacking/
intra-case; used for order-INDEPENDENT quota + rate confirmation). Lower-res portrait
photos: identity + rarity-icon reliable; the borderless-Hyperspace tell is NOT reliably
visible → HS leader/base/common rates NOT measurable from Teddy, and foil-hit RARITY
noisy (Rare-foil vs UC3 HS-Rare confusable). Rare-slot R/L (structurally locatable
pos16) and foil common-count are the trustworthy signals.

| Box | packs | rare slot | foil |
|---|---|---|---|
| teddy-01 | 24 | **19R / 5L** | 19C + 5 |
| teddy-02 | 23 (1 pack missing) | 17R / 6L | 19C + 4 |
| teddy-03 | 24 | **19R / 5L** | 22C + 2 |
| teddy-04 | 24 | 18R / 6L | 18C + 6 |

**Rare-slot legendaries per box:** **5,5,5,5** (Lee, verified) + **5,6,5,6** (Teddy).
⚠️ The two Teddy 6L are REAL (all 12 teddy-02/04 rare-slot legendaries verified genuine
against the card DB — see the RETRACTED section below). So legendary count VARIES (5–6
observed here; wider in the real population). Foil common-count clusters ~18–22 ≈ 20/box.
→ The MEAN (~5L, ~20C) is well-supported; the "fixed count per box" is NOT — it was an
over-read of ~3 correlated cases. Model as a sheet-cut with real variance, not a quota.

Teddy detection artifacts (NOT real findings): "Showcase at UC3" (pack) = misread HS-UC;
"Doc Defender" foreign card = misread DDC Defender (#210); numHScommons=0 everywhere =
resolution can't see borderless frame. Raw per-pack summaries in scratch (crops/teddy-0X/out/).

## Box-006 (Lee box5) & Box-007 (Lee box6) — 2026-07-11

- **box-006 (Lee box5, sharp): LOCKED-draft, 24 packs.** Rare slot **19R/5L** (exact),
  foil 20C+4, dispersion pools **6/5/5/7 (clean)**, 180 distinct. (leader/base variants
  glare-obscured → unverified, but rare-slot/foil/dispersion reliable; pack18 2-HS-common,
  pack23 foil@pos8 → canonical-slot fix pending opus verify.)
- **box-007 (Lee box6, handheld, variable blur): PARTIAL — 22 unique packs of 23 photos.**
  pack19 is a re-shoot DUP of pack20 (identical 16 cards; blurry original set aside);
  box is missing ~2 packs (only 22 unique). Rare slot **17R/5L** (5L in 22 packs), foil
  ~17C+5 → consistent with the quota. NOT usable for clean pool dispersion (incomplete).
  Uncertain cards → manual-review package (like box-005). Lesson: Lee re-shoots blurry
  packs, so watch for duplicate-pack photos (added dup detection to merge).

# ✅ PHASE 4 — FINAL DECISION (10 boxes: box-001 + Lee 002/003/004/006/007 + Teddy ×4)

### 1. ⚠️ RETRACTED — "hard per-box quota" was WRONG. Model the R/L + foil SHEETS instead.
**CORRECTION (2026-07-11):** An earlier version of this section claimed a HARD per-box
quota (exactly 5L+19R, 20C+4 every box) and dismissed the two Teddy boxes that read 6L as
"likely low-res misreads." That dismissal was confirmation bias and is FALSE — verified by
re-checking every agent-called Legendary in teddy-02/04 against the card DB: **all 12 are
genuine Legendary cards (Chimaera ×3, Zeb Orrelios ×2, Eye of Sion, The Mandalorian
Devoted Rescuer ×2, Summa-verminoth, Kelleran Beq, Boba Fett's Rancor, The Darksaber) —
zero misread Rares.** So legendary count per box genuinely VARIES (observed 5 and 6; Lee
confirms the real population ranges low-to-high around an advertised average). A "hard 5"
is also non-physical: a printer has no per-box counter, only what's on the sheet.

**What's actually true:** the R/L slot (and foil slot) are fed by **print sheets with a
fixed composition** (~5L per 24 R/L cards on average), collated in sheet order; a box is a
consecutive cut. The MEAN per box is set by the sheet; the COUNT per box varies because
24-card cuts don't all contain the same number of Ls. My ~9 "boxes" were really ~3 cases
(Lee = 1 sealed case, Teddy = 1 case, + display box) — within a case the boxes are
correlated (contiguous sheet stretch), which made the count look artificially constant.

**Corrected recommendation (Set 7+):** model the R/L and foil slots as **sheet-cuts** — a
long sequence with the right composition, boxes = consecutive cuts — giving the correct
average WITH real box-to-box variance. This may be close to the current per-pack model
(Binomial(24,~1/6) already produces low-to-high legendary counts); the defensible change
may shrink to **the mean/rate** (current ~4/box; if advertised avg is ~5, bump it) plus
possibly a modest variance reduction if collation demonstrably spreads hits. DO NOT
implement a fixed count. Needs boxes from INDEPENDENT cases/print-runs (not more from the
same case) or public box-break data to characterize the true variance.

### 2. 🟠 IMPLEMENT — relax UncommonBelt aspect interleaving (Set 7+)
Real uncommons ≈ random adjacent-aspect (8.3% vs 11.5% shuffled, 0.72×, n.s.), NOT the
common sheet's hard rotation. `UncommonBelt.buildInterleavedSequence` over-rotates them
toward ~0%. Relax to ~random; keep name-dedup.

### 3. ✅ NO CHANGE — duplicate-tail / dispersion (the original "main event")
20 real pools (known order): dup-identities mean **6.4**, clumpy (≥10) **2/20 = 10%**
(both in box-001; Lee's case boxes all clean). Shipped knobless model: mean **6.7**, clumpy
**~8%**. **They match.** Clumpy pools are real but rare and box-correlated; the shipped
model's dispersion is already correct. → Do NOT add stretch-echo / change dedup windows.
(Resolves the Phase-4 decision rule: "loaded pools rare → shipped model stands, change nothing.")

### 4. ✅ NO CHANGE — aspect rules
Common sheet: hard rotation (0/501) — keep. Rare/Legendary sheet: aspect-CLUSTERED on the
line but random to the player (stacking scrambles it) — RareLegendaryBelt already gives
random consumer adjacency; add nothing.

### 5. ✅ CONFIRMED dead-on (no change)
HS leader/base ≈1/6, leader+base HS co-occurrence real (~1/36), UC1/UC2 HS = 0, HS common
1/pack, UC3 ~1/3 upgrade + outcome mix, within-pack dups all cross-variant, box-unique ≈185,
stacking interleave (4 line-order tracers; box orientation varies per case slot).

## 🎴 Fan "Press Kit display" box — quota confirmation (2026-07-11)
Grid-transcribed by NAME by a fan (24 packs; HS/HF row markers). Ingested via fuzzy
name-match → number resolver (383/384 matched; "Sloane"→Grand Admiral Sloane #7).
**Rare slot = 19R/5L (EXACT).** Foil ≈ 21C/3U (mostly common). Only usable for the
QUOTA — HS leader/base, UC3 upgrades, prestige not captured (grid defaults them);
dispersion invalid (grid is block-organized, not pull order). CSV: scratch/ash-box-display.csv.

### ⚠️ Rare-slot ~5L/box AVERAGE well-supported; "fixed quota" RETRACTED
Lee 001/002/003/004/006 + 005 = 6 boxes at 5L; fan display box 5L; **Teddy 02 & 04 = 6L
(verified genuine legendaries, NOT misreads)**. So the MEAN is ~5L/box but the COUNT
VARIES (5–6 here; low-to-high in the real population per Lee). This is ~3 correlated cases,
not 9 independent boxes. The rare slot is a print SHEET (fixed composition, boxes = cuts) —
model it as a sheet-cut with real variance, tuned to the average. NOT a fixed count.

## Box-005 (Lee box4, blurry/gone) — RESOLVED via name-validated review ✅ (2026-07-11)
Lee reviewed all 174 uncertain cards by name (blank variant = confirmed Normal;
numbers derived name+variant+slot). Rare slot **19R/5L (6th consecutive Lee box)**;
foil 19C+5; dispersion 4/4/8/5 (clean — Lee case now 5/5 clean boxes, 20 clean pools
+ box-001's 2 clumpy = 2/24 ≈ 8% overall, still matching the shipped model);
185 distinct. HS leader 4/24 + base 4/24, **leader+base co-occur in packs 2/8/13**
(3/24 — hot vs ~1/36, review-confirmed; watch). pack6 genuine 2-HS-common. Open:
pack12 shows 0 HS commons (its commons were high-conf first-pass reads outside
review scope) — needs a targeted look at one photo.
