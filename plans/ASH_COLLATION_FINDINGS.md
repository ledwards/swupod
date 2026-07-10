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
