# Import Pool extraction: <$0.10/sheet cost plan

**Hard budget: under $0.10 per sheet imported.** Set 2026-07-03 after
instrumentation (commit `488bed3e`) revealed real costs. The premium
(≥$1/sheet) accuracy plan is parked at the bottom — do not build it until
the budget changes.

## Measured baselines (2026-07-03, opus-4-7 rates $15/$75 per MTok)

| Path | Cost/sheet | Notes |
|---|---|---|
| Legacy multi-sample (`extractPoolFromImages`) | **$18.03 measured** | 166 calls, 683K input, cache never hits (parallel same-table samples race past it). Eval harness scores THIS path today — wrongly. |
| Prod whole-table (`extractPoolFromImagesWholeTable`) | ~$0.55–0.69 (doc'd; re-measure in Phase 0) | OMR sidecar crops tables; ~10 closed-vocab calls. What users actually get. |
| Agentic prototype (`extractPoolAgentic`, fable-5) | ~$0.65–3.24 bounded | 100/100 on n=2 sheets. PARKED — see bottom. |

Why opus can't hit the target: the ~12 images per sheet are ~25K input
tokens ≈ $0.37 at opus rates before a single output token. The model tier
is the only 6x lever. Haiku 4.5 (`claude-haiku-4-5-20251001`, $1/$5,
cache $0.10 read / $1.25 write) prices the same workload at ~$0.04.

## Phase 0 — point the eval at reality, measure prod path (~$1 total)

1. Add an arch switch to `run-eval.ts` / `regenerate-fixture.ts`
   (`EXTRACT_ARCH=wholetable|legacy`, default `wholetable`) so the eval
   scores what prod serves. Also makes eval sweeps ~30x cheaper.
2. One instrumented whole-table run on a verified fixture → exact
   baseline cost + accuracy (accounting is already wired; it prints).
3. Baseline sweep on the 5 verified fixtures at whole-table/opus (~$3)
   → the accuracy bar Haiku must meet.

## Phase 1 — model tier (~$0.25 to verify)

4. `IMPORT_EXTRACT_MODEL=claude-haiku-4-5-20251001` sweep on the 5
   verified fixtures (~$0.04 × 5). Unified env override landed today —
   one env var swaps every phase.
5. Acceptance: recall/precision within 2 points of the opus whole-table
   baseline. If Haiku holds → flip prod default. **~$0.04/sheet. Done.**
6. If Haiku is close-but-short, try Sonnet 5 (still likely ~$0.10-0.15 —
   only acceptable with Phase 2's output diet) before any escalation
   complexity.

### Phase 0/1 results (2026-07-03)

- Whole-table + opus baseline (sq-tom-law): **95.7r/97.8p, $1.17/sheet
  measured** — output tokens (all-rows JSON at $75/MTok) are the cost hog.
- **Haiku 4.5: NO-GO on vision.** Sweep of 5 verified fixtures:
  71.2r/76.6p mean, hallucinates upward (sfpq 119/96 pool, 45 FP), deck
  sums wild. Price was right (~$0.075/sheet) — accuracy wasn't.
- **Sonnet 5 sweep invalidated by harness bugs**, since fixed:
  classifyTableWithClaude read content[0] (the THINKING block on Claude 5
  models) instead of finding the text block, and MAX_TOKENS 6000 starved
  thinking runs. Fixed: block find + 16K cap.
- **Economics kill mid-tier thinking models regardless**: Sonnet 5 spent
  ~25-30K output tokens/sheet on thinking alone (~$0.40 at sonnet-class
  out-rates) — over budget even if accuracy passes, and the output diet
  can't cut thinking. Model-shopping is a dead end for <$0.10;
  **Phase 5 (OMR cells) is the road.** Single-cell tally reading is a far
  easier task than whole-table scanning — cheap models plausibly hold
  accuracy there.

## Phase 2 — token diet (free to implement, ~$0.25 to re-verify)

7. Marked-rows-only output: whole-table calls currently return JSON for
   ALL rows ("most will be poolQty=0"). Return only rows with marks;
   server reconstructs zeros from the closed vocab. ~80% output cut.
8. Cache hygiene: per-table card vocab is static per set but sits in the
   uncached user turn; the 10 parallel table calls also race the cache.
   Prime with one serial call, then parallelize. (Matters less at Haiku
   rates — do it only if Phase 1 lands on Sonnet.)
9. Phase 1 max_tokens stays 16K (thinking-model headroom, costs nothing
   on non-thinking models — it's a cap, not a spend).

## Phase 3 — accuracy fixes that cost nothing extra (from 2026-07-03 findings)

10. **Sheet species detection** before invariant enforcement: sealed
    (96/6/6), draft (48 = 3×16, 3L/3B), deck-only (~30-35 marks, PLAYED
    column often empty), unknown. Detected species drives which totals
    are enforced and shows a ResolveStep banner. Two of Taylor's three
    real event sheets were NOT sealed sheets; the 96/6/6 assumption made
    the model fabricate rows ("The Client ×6", 7 phantom bases).
11. **Remove fabrication pressure** from prompts/refines ("MUST equal
    96/6" → honest `unresolvedDeficit` field, surfaced as a ResolveStep
    anomaly chip). Never let an invariant overwrite perception.
12. **Bases table special handling** — the only table with no printed
    card numbers; fabrication hotspot for every model on 4 of 5 fixtures.
    Base-name closed vocab + "never infer unmarked bases" + one retry.
13. **Tile any table crop >1568px** (Multicolor) so the API never
    downscales — faint pencil dies in downscale. Native-res tiles are a
    proven chunk of the agentic prototype's 100/100.
14. **Surface existing per-column confidence in ResolveStep** (sort
    low-confidence rows first). Fields already exist server-side.

## Phase 4 — selective escalation (only if Phase 1-3 accuracy is short)

15. Per-TABLE escalation, not per-sheet: a table failing its
    species-conditional check re-runs once on Sonnet/Opus (~$0.01-0.05).
    Budget guard: escalation capped so blended average stays <$0.10;
    per-sheet cost logged (route already logs usage) and alerting on
    breach.

## Phase 5 — endgame if we need more headroom (~$0.01-0.03/sheet)

16. OMR cell-level pipeline: the Python sidecar already finds tables and
    row geometry. Classical CV can detect WHICH cells contain ink
    (blank-cell detection is trivial; ~95% of cells are blank) — the LLM
    then only reads the ~60-90 inked cells as tiny crops (~8 tokens
    each) in 1-2 batched calls. Near-model-agnostic, ~$0.01-0.03/sheet
    at Haiku rates. Bigger build (sidecar Python + cell plumbing);
    justify only if Phases 1-4 can't hold accuracy at budget.

## Guardrails (standing)

- Cost prints on every eval/regenerate run; prod route logs per-attempt
  usage. Watch it.
- No batch API work (N fixtures × M models) without a dollar estimate
  approved first.
- Eval sweeps use the 5 verified fixtures only (`_note` starters are
  auto-skipped since today).

---

## PARKED: premium accuracy plan (≥$1/sheet — do not build under current budget)

`lib/agenticExtract.ts` (branch `eval/prague-taylor-fixtures`) is a
tool-use-loop extractor: model drives its own native-res crops
(`crop_region`), species reasoning, honesty rules, schema-enforced
`submit_rows` joined against cards.json. Verified 2026-07-03 with
fable-5: **27/27 exact** on a deck-only sheet (97s) and **92/92 exact**
on a hand-verified sealed sheet (9.5 min) — vs prod's ~90/94
recall/precision. Cost $0.65–3.24/sheet (fable rates unpublished).

If the budget ever allows, the shipping shapes, cheapest first:
1. Escalation tier only: agentic pass for the Bases table + sheets whose
   marks fit no species (rare → blended cost stays low).
2. Opt-in "high-accuracy re-scan" button on ResolveStep for sheets the
   user flags as badly read (per-use cost is visible and bounded).
3. Ground-truth generation for new eval fixtures (its current job —
   this is how palmsprings a/b truths were built).
4. Full agentic default — only if per-sheet economics change by ~20x
   (cheaper capable models or per-import monetization).
