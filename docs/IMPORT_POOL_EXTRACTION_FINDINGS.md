# Import Pool extraction — empirical findings (2026-07-03/04)

Two days of measurement against hand-verified ground truth. Every number
here is from a real run scored against `scripts/eval/fixtures/*` truths.
For the active cost roadmap see `plans/IMPORT_POOL_COST_PLAN.md`.

## The scoreboard (verified fixtures, whole-table architecture unless noted)

| Configuration | Recall | Precision | $/sheet |
|---|---|---|---|
| **opus 4.7 + tuple output diet (SHIPPED 07-04)** | **94.6%** | **97.8%** | **$0.73** |
| opus 4.7, verbose output (pre-diet prod) | 95.7% | 97.8% | $1.17 |
| opus 4.7, marked-rows-only output (rejected) | 88.0% | 93.5% | $0.96 |
| fable 5 (phase-1 swap only — see split-brain below) | 88.6% | 95.0% | n/a |
| haiku 4.5 | 71.2% | 76.6% | $0.075 |
| cells architecture + haiku (best of 4 variants) | 76.1% | 98.6% | $0.09 |
| cells, classical CV only (no model) | 10.5% | 43.6% | $0.00 |
| agentic prototype + fable 5 (n=2 sheets) | 100% | 100% | $0.65–3.24 |
| legacy multi-sample path (the sidecar-failure fallback) | 80-90% | 84-98% | **$18.03** |

## Findings that should outlive this work

1. **Enumeration is attention.** Asking the model to output every row
   (including ~250 zeros) is what forces it to look at every row.
   Marked-rows-only output saved tokens and cost 7.7 points of recall.
   The shipped fix: keep full enumeration, compress the encoding —
   compact tuples `[n,p,t,pu,tu]` cut output ~55% at accuracy parity.
   Generalizes: never trade away a per-item output obligation for
   brevity when per-item attention is the point.

2. **Invariant pressure manufactures hallucinations.** Prompts that say
   "pool MUST sum to 96 / find the N missing rows" make models INVENT
   rows when the sheet genuinely doesn't have 96 marks ("The Client ×6",
   7 fabricated bases on a draft sheet). Detection was near-perfect
   (98-100% recall) on those same sheets — the fabrication came entirely
   from repair pressure. Give models an honest out (`unresolved` /
   deficit fields) instead of a mandate.

3. **Registration sheets come in species.** Full sealed (96 pool /
   6 leaders / 6 bases), top-8 draft (48 = 3 packs × 16, 3L/3B), and
   deck-only (~32 marks: 30 deck + leader + base, PLAYED column often
   empty). Two of Taylor's three real event sheets were NOT sealed
   sheets. Any 96/6/6 assumption baked into prompts, invariants, or UI
   corrupts the other species. (Species-aware handling: still TODO —
   plan Phase 3.)

4. **The Bases table is the structural weak point.** It is the only
   table without printed card numbers, so nothing anchors reads to rows.
   Every model fabricated or dropped bases on 4 of 5 fixtures at some
   point. Fix direction: base-NAME vocabulary + "never infer unmarked
   bases" (plan Phase 3).

5. **Model tier is not a free lever.** Haiku 4.5 reads handwriting too
   unreliably for whole-table scanning (71% recall) AND for isolated
   strip reading (76% best, non-deterministic table zero-outs).
   Sonnet-class thinking models burn ~25-30K thinking tokens/sheet
   (~$0.40) which no output diet can cut. As of 2026-07, 95% accuracy
   requires opus-class perception; its floor after the diet is ~$0.73.
   Re-test cheap models as they release: one env var
   (`IMPORT_EXTRACT_MODEL`) + one $0.10-1 eval run answers it.

6. **Thinking-model API gotchas** (cost us a day of misleading A/Bs):
   - `max_tokens` must budget for thinking (Claude 5 family spends
     output budget on thinking blocks BEFORE the JSON) — 2K/6K caps
     starved Phase 1/Phase 2; both now 16K (a cap, not a spend).
   - Never read `response.content[0].text` — on thinking models block 0
     is the thinking block. Always `content.find(b => b.type === 'text')`.
   - Watch for MODEL const split-brain: three files each had their own
     hardcoded model, so an "A/B" swapped only Phase 1 for a day. All
     three now resolve `IMPORT_EXTRACT_MODEL || 'claude-opus-4-7'`.

7. **Classical CV cannot build a reliable row lattice from phone
   photos.** Ruled-line detection (even with gap-filling and printed-
   text re-centering) produced 11-14 bands for 18-row tables, varying
   per fixture — so ordinal row→card mapping fails before qty reading
   matters. What DOES work classically: marks-only ink detection
   (grid-subtracted) as an emitter of candidate row strips — its
   precision architecture means zero fabricated rows by construction.
   The strip approach parks until a cheap model can read strips
   reliably.

8. **The agentic tool-use extractor is the accuracy ceiling.**
   `lib/agenticExtract.ts` (model drives its own ≤1568px native-res
   crops, species reasoning, schema-enforced submit): 2-for-2 perfect
   scores including a deck-only sheet the pipeline had hallucinated all
   over. Too slow/expensive for default prod (~1.5-9.5 min, $0.65-3.24)
   but ideal for generating fixture ground truth and as a future
   escalation tier.

9. **Vision API resolution cap matters:** images over ~1568px on the
   long side get downscaled server-side and faint pencil marks die.
   Tile anything bigger (the agentic extractor and strip generator do;
   whole-table crops mostly fit).

## Operational learnings

- **Cost accounting is now wired end-to-end** (`ExtractUsage` sink
  through every API call; `run-eval`/`regenerate-fixture` print
  per-fixture tokens + dollars; the prod route logs per-attempt usage).
  Before this, a single eval day burned ~$300+ invisibly — the legacy
  multi-sample path costs $18.03/sheet (166 calls, 683K input, 0% cache
  hits from parallel same-table sampling) and the eval was pointed at it
  by default. `EXTRACT_ARCH` now defaults to what prod serves.
- Eval hygiene: fixtures whose ground truth still carries a `_note`
  starter marker are auto-skipped (scoring against unverified truth
  poisoned aggregates). Estimate dollars and get a go-ahead before any
  N-fixtures × M-models batch.
- The whole-table baseline itself varies ±3-5 recall points run-to-run;
  single-run comparisons under ~5 points are noise. The multi-sample
  legacy path was built against that variance but costs 15x — if
  variance matters again, re-run the eval N times, don't multi-sample
  in prod.

## Prototypes parked on this branch

- `lib/agenticExtract.ts` + `scripts/eval/run-agentic.ts` (agentic; see
  finding 8).
- `EXTRACT_ARCH=cells`: sidecar `--cells` row-strip pipeline
  (`extract_for_node.py`, `classifyCellStrips`) — cost-proven at
  ~$0.09/sheet, blocked on cheap-model reading reliability (finding 5).
- Verified-fixture corpus grew from 5 → 10 sheets (prague + palm
  springs; two adjudicated to exact truth by the agentic/in-chat method,
  three awaiting hand-verification — see
  `scripts/eval/fixtures/REVIEW-CHECKLIST-2026-07-03.md`).
