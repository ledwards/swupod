# Plan: Investigate Whether Pack Generation Has a Duplicate Problem

**Question:** are players getting more duplicate cards than a fair pack process
should produce? The Luck tab surfaced suspiciously high repeat counts; before we
trust or act on that, prove whether it's (a) normal birthday-paradox variance,
(b) a measurement artifact, or (c) a real generator bug.

## Hypotheses to separate

1. **Normal variance** — with a fixed ~250-card set and N packs, repeats are
   guaranteed and grow predictably. The "high" rate is just math.
2. **Measurement artifact** — actual counts cross-treatment (foil/HS fold onto
   the base card) while expected is base-only, so actual *looks* inflated.
   (This is almost certainly part of it — see `LUCK_EXPECTED_RATES_PLAN.md`.)
3. **Generator bug** — the belt/hopper system over-repeats within or across packs
   beyond fair randomness (e.g. a seam-dedup gap, a hopper that doesn't reshuffle,
   a weighting error).

## What "fair" predicts (the baseline to compare against)

For independent draws from pool size `P` over `K` total card slots, expected
distinct cards `E[distinct] = P·(1 - (1 - 1/P)^K)`, and expected duplicates =
`K - E[distinct]`. The belts are NOT independent draws (hopper without
replacement within a pack, 60-pack budgets), so the **empirical generator** is
the real baseline, not the closed form.

## Method

1. **Define the metric precisely.** Pick ONE clear definition and use it
   everywhere:
   - `copiesPerCard = totalPulls / distinctCards`
   - `repeatShare = (totalPulls - distinctCards) / totalPulls`
   Report both with plain-language labels; stop calling it an ambiguous "rate".
2. **Generator simulation (ground truth).** Use `src/utils/boosterPack.ts` to
   open 1k / 10k / 100k packs per set (the QA harness already does volume runs —
   `npm run qa`). Record, per run: total pulls, distinct base cards, copies-per-card,
   repeat-share, and the full per-card count histogram. This is what a *correct*
   process produces. Do it per set (slot structure differs).
3. **Within-pack check.** Confirm no pack contains an illegal duplicate (the belt
   tests already assert "no duplicate cards within 6 slots / within a pack" —
   extend to assert zero exact-duplicate base cards within a single pack except
   where rules allow, e.g. a card appearing as both base and foil).
4. **Cross-pack check.** Compare copies-per-card across many packs to a
   Monte-Carlo "ideal" (draw each slot uniformly from its rarity pool with the
   real pool sizes). If the generator's repeat-share is materially above the
   ideal, that's a candidate bug; quantify the gap with a confidence interval.
5. **Real-data check (prod).** Against the Railway DB (where real volume lives —
   the local dev DB is nearly empty, see the data-pipeline note), compute the same
   metrics per user and in aggregate from `card_generations`, grouped by
   `(source_id, pack_index)`. Compare the population distribution to the simulated
   one. Watch for: pack_index nulls (older pools) skewing pack counts; treatment
   double-counting; per-set differences.
6. **Decision.** 
   - If real ≈ simulated ≈ math → no problem; fix only the *presentation* and the
     expected baseline (the other plan). 
   - If real > simulated → measurement artifact or data issue; isolate.
   - If simulated > ideal → generator bug; bisect the belts (hopper reshuffle,
     seam dedup, weighting) with targeted tests.

## Tooling to build

- A `scripts/dupAudit.ts` that runs the generator N times per set and prints the
  metric table (sim side) — reuse QA plumbing.
- A read-only SQL audit (run against the populated DB) producing the same metric
  table from `card_generations` (real side), regular boosters only
  (`pack_type='booster'`), grouped by pack.
- A short writeup comparing sim vs real vs ideal per set, with the verdict.

## Deliverables

- The metric table (sim / real / ideal) per set.
- A clear verdict: variance vs artifact vs bug, with evidence.
- If a bug: a failing test that reproduces it, then the fix (red-green).
- Feed the chosen, unambiguous metric back into the Luck duplicate widget.

## Dependency

The "real-data check" needs the populated database. The local dev DB
(`protectthepod`) currently holds only ~192 generations; the volume is in the
Railway DB. Run the real-side audit against that (read-only).
