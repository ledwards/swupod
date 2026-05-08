# Import Pool — Handoff for Next Agent Session

This is a self-contained brief. Read it end-to-end before touching code. Nothing in this doc relies on prior conversation history.

## Decision the user made

The LLM-only architecture has plateaued at ~84% mean recall / ~83% mean precision across 3 pristine fixtures with ~$1-2 cost per import and high run-to-run variance. The next direction is **Optical Mark Recognition (OMR)** — a deterministic CV pipeline — with Claude relegated to a tiebreaker role for ambiguous cells.

Cloud Document AI services (Google Document AI, AWS Textract, Azure Document Intelligence) were researched and rejected: all three return binary `selected/unselected` per ROI, no native concept of "1 vs 2 tally strokes," and benchmark accuracy on hand-marked dense forms is in the 60-71% range — same ceiling as the current Claude-only approach, at $30-65/1k pages.

The OMR direction is informed by mature open-source prior art:
- [PyImageSearch bubble-sheet tutorial](https://pyimagesearch.com/2016/10/03/bubble-sheet-multiple-choice-scanner-and-test-grader-using-omr-python-and-opencv/)
- `rbaron/omr`, `murtazahassan/Optical-Mark-Recognition-OPENCV`, OpenMCR (GitHub)
- TCG-adjacent OSS scanners (mtgscan, NetDecker, HoloScan) all use direct CV, not Document AI.

## Current state of the code

- Branch: `feat/import-pool-spike`
- Latest commit: `5979950` (sq-lee-law fixture pristine ground truth)
- Production-pathed code is in:
  - [lib/anthropic.ts](../lib/anthropic.ts) — Phase 1 (header + bounds) + Phase 2 (per-sub-group multi-sample voting) orchestration
  - [src/services/importPool/sectionExtraction.ts](../src/services/importPool/sectionExtraction.ts) — per-table Claude call, multi-sample voting, second-chance pass
  - [src/services/importPool/preprocessImage.ts](../src/services/importPool/preprocessImage.ts) — auto-orient (EXIF + landscape→portrait fallback) + sharpen-only contrast
  - [src/services/importPool/tableGrouping.ts](../src/services/importPool/tableGrouping.ts) — 10-table + 22-sub-group taxonomy
  - [src/services/importPool/invariants.ts](../src/services/importPool/invariants.ts) — structural rules: pool=96, leader pool=6, base pool≥6, deck 30-35, leader/base deck 0-or-1
- Routes: [app/api/import/extract/route.ts](../app/api/import/extract/route.ts) — auth-gated patron-only, calls extractPoolFromImages, sanitizes, matches against card cache.

## Eval fixtures (3 pristine)

Located in [scripts/eval/fixtures/](../scripts/eval/fixtures/):

| Fixture          | Photo size       | Notes                                                    |
| ---------------- | ---------------- | -------------------------------------------------------- |
| `sq-tom-law`     | 2160×2880 (6MP)  | Tom Barbour, SQ event. Standard portrait. 92 marked rows. |
| `casual-lee-law` | 5712×4284 (24MP) | Lee, casual play. **EXIF orientation=6, needs auto-rotate.** No leader picked. 91 marked rows. |
| `sq-lee-law`     | 4284×5712 (24MP) | Lee, SQ event. Has corrections (Director Krennic 2→1, Milodon Rider judge-signed). 7 bases (1 rare). 90 marked rows. |

**Photos are gitignored.** Each fixture's `ground-truth.json` is committed; photos must be supplied locally. The user has them in `~/Downloads/data/{tom-sq,lee-sq,lee-local}/`. (Yes the fixture names don't match the directory names — `lee-local` is `casual-lee-law`.)

Run the eval against all 3:
```bash
SAVE=1 npx tsx scripts/eval/run-eval.ts
```

Re-extract a fixture's starter (after editing photos or algorithm):
```bash
FIXTURE=<name> npx tsx scripts/eval/regenerate-fixture.ts
```

Load a hand-corrected pristine truth:
```bash
FIXTURE=<name> INPUT=/path/to/text.txt npx tsx scripts/eval/load-truth.ts
```

The text format is `<deck> <pool> <num>` per line, one per card. Comments `#`, blank lines, and `*` change-markers are ignored. The parser strips `*`, validates pool=96 / leader pool=6 / base pool≥6 / deck 30-35 / no subset violations, and writes `ground-truth.json`.

## Latest eval results (against pristine truth)

```
                  casual-lee-law    sq-lee-law       sq-tom-law
recall            92.3%             76.7%            ~89% (last clean run)
precision         93.3%             73.4%            ~94%
pool sum          95/96             100/96 (over)
TP / FP / FN      84 / 6 / 7        69 / 25 / 21
elapsed           187s              115s             ~150s
```

**sq-lee-law is the overfitting tell.** Algorithm performs ~16 points worse on a NEW photo than on the two it was tuned against. High variance run-to-run on the same fixture too (10+ point swings).

## What's been tried (this session) and what stuck

**Stuck (all in current commit):**
- Auto-orient photos: EXIF rotation + landscape→portrait fallback. Fixed 35-point pool jump on rotated 24MP photos.
- Per-table closed-vocab grounding (each Phase 2 call sees only that table's cards).
- Sub-aspect splitting (Vigilance/Command/Aggression/Cunning split into 3 sub-groups; Multicolor split into 6 aspect-pair sub-groups).
- Multi-sample voting (3-9 samples per sub-group depending on size).
- Adaptive sample counts: 9 for Leaders/Bases, 7 for ≤15-card sub-groups, 5 for larger.
- Second-chance pass for small sub-groups that voted 0 marks (re-runs with "look harder" hint).
- Structural rules: pool=96 hard, leader pool=6 exact, base pool≥6 (rare bases), leader/base deck 0-or-1.
- Bigger crop padding (4% from 2%).
- Native-resolution crops (crop original photo, then preprocess; preserves detail on large photos).
- Sharpen-only contrast (dropped `normalise()` and `linear()` — they wash out marks on bright photos with uneven brightness).
- Row-anchor verification in per-table prompt (tells model to trace right from each mark to the printed card number).
- Manual retry on `terminated` socket errors at the per-iteration level.
- 30-min route timeout in `app/api/import/extract/route.ts` (`maxDuration = 1800`).

**Tried and reverted (regressed accuracy):**
- Top-N selection on Leaders/Bases by raw vote count. Fails because off-by-one alignment errors are *consistent* across samples — top-N picks the same wrong neighbour.
- Per-sub-aspect bboxes from Phase 1 (raw): tighter crops cut off PLAYED/TOTAL column header. Mean recall regressed to 80%.
- Per-sub-aspect bboxes with extension upward to include the column header: helped casual (93.4% recall) but Tom regressed because extension included sibling sub-section rows.
- Per-sub-aspect bboxes for Multicolor only: small change, no improvement.
- Multicolor-specific increased sample count: marginal, not worth complexity.

**Phase 1 still RETURNS sub-section bboxes** (in the schema, the `subSections` array of `SUB_GROUP_KEYS`). Phase 2 doesn't use them. Kept for future re-investigation.

## Plan: OMR pivot

The pivot is non-trivial. It's a different runtime model, different failure modes, different cost structure. Build it as a parallel path that can run alongside the LLM path until validated, then replace.

### Phase A — OMR core (the workhorse)

1. **Add OpenCV bindings.** `opencv4nodejs` is fragile to install on macOS; the cleaner path is a Python sidecar invoked via child_process from the Next.js route. The repo already has Python tooling (e.g., for QA scripts). Choose:
   - Python sidecar: 100-line script called via `spawn` from a service module. Easiest, most maintainable.
   - Node `sharp` + manual pixel iteration: do-able for the threshold/count step but fiducial detection and homography are brittle without OpenCV.

2. **Define the canonical grid.** For each set (currently just LAW), one-time work:
   - Take a clean reference scan of the blank registration sheet (from FFG / SCG, or one of our 3 fixture photos cleaned up).
   - Identify the 4 fiducial corners. The simplest fiducial: the printed table headers ("LEADER", "BASE", "VIGILANCE (BLUE)", etc.) at known positions, OR the corners of the largest table boundaries.
   - Define ROI grid: for each card_number, store `(x, y, w, h)` for its PLAYED cell and TOTAL cell in canonical pixel space. ~250 cards × 2 cells = 500 ROIs.
   - Persist as JSON: `src/data/omr-templates/LAW.json`. One per set; future sets need their own template.

3. **Per-image extraction:**
   ```
   a. preprocessImage → autoOrientToPortrait (existing pipeline)
   b. detect fiducials → compute homography → warp to canonical
   c. for each ROI in template:
        crop the canonical-warped image at (x,y,w,h)
        Otsu threshold
        count dark pixels OR connected components
        classify {0, 1, 2, 3+} based on calibrated thresholds
   d. emit `{ cardNumber, poolQty, deckQty, confidence }` per row
   ```

4. **Calibrate thresholds.** Run OMR on the 3 pristine fixtures; for each cell, compute pixel-density distribution; pick threshold values that minimise total error vs the ground truth. Save to template JSON.

5. **Confidence per cell.** Distance from threshold = confidence. Cells near the threshold ("borderline empty" or "borderline 1-stroke") get confidence < 0.7 and are flagged for tiebreaker.

### Phase B — Claude tiebreaker (the resolver)

For each ROI flagged low-confidence by OMR:
- Crop just that ROI (~30×60px)
- Send to Claude with a tiny prompt: "How many tally strokes are in this cell? Reply 0, 1, 2, or unclear."
- Use the response if confident; else flag for resolve UI.

This collapses ~250 LLM calls/sheet to ~5-15 (only ambiguous cells), cutting cost by ~95% while keeping LLM smarts where it matters.

### Phase C — Integration

- New service module: `src/services/importPool/omrExtraction.ts`
- New types: `OmrCell { cardNumber, poolQty, deckQty, confidence }`
- Modify `extractPoolFromImages` in [lib/anthropic.ts](../lib/anthropic.ts) to:
  - Run Phase 1 (header + bounds) — kept from current architecture
  - Run OMR pipeline instead of multi-sample Claude calls
  - Run Claude tiebreaker on low-confidence cells
  - Aggregate into `RawExtractResponse` (same return shape; route handler doesn't change)
- Eval harness already works against any `extractPoolFromImages` implementation — no changes needed there.

### Validation gate

OMR pipeline must hit ≥97% recall AND ≥97% precision on all 3 pristine fixtures before replacing the LLM path. If it doesn't, debug template alignment / thresholds / fiducial detection — those are deterministic so failures are debuggable in a way the LLM's variance never was.

## Key files for the next agent

| Path | Why |
|------|-----|
| [lib/anthropic.ts](../lib/anthropic.ts) | Where extractPoolFromImages lives. Keep Phase 1, replace Phase 2. |
| [src/services/importPool/sectionExtraction.ts](../src/services/importPool/sectionExtraction.ts) | Per-table Claude calls. Some can be repurposed for tiebreaker. |
| [src/services/importPool/invariants.ts](../src/services/importPool/invariants.ts) | Structural rules. OMR output should also pass these. |
| [src/services/importPool/tableGrouping.ts](../src/services/importPool/tableGrouping.ts) | Card → table → sub-aspect mapping. |
| [src/services/importPool/preprocessImage.ts](../src/services/importPool/preprocessImage.ts) | Auto-orient logic. OMR pipeline should use the same. |
| [scripts/eval/run-eval.ts](../scripts/eval/run-eval.ts) | Eval harness. Validates against ground-truth.json. |
| [scripts/eval/load-truth.ts](../scripts/eval/load-truth.ts) | Hand-correction parser. |
| [app/api/import/extract/route.ts](../app/api/import/extract/route.ts) | API route. Auth, sanitization, response shape. |
| [src/data/cards.json](../src/data/cards.json) | Card data. cardId encodes the printed card number. |

## Gotchas / tribal knowledge

- **EXIF orientation.** iPhone photos arrive as raw landscape pixels with an EXIF orientation tag telling viewers to rotate. Sharp's `.rotate()` (no args) applies it. Without that, Phase 1 sees the sheet sideways. There's also a fallback heuristic: post-EXIF, if image is still landscape, rotate 90° CW (sealed sheets are always portrait). See `autoOrientToPortrait` in preprocessImage.ts.
- **Bases pool ≥ 6, not = 6.** Sealed packs have 6 common bases plus optionally one or more rare bases (rare-base slot is per-pack random). Tom has 6, Lee's SQ has 7 (1 rare). Don't enforce exactly 6.
- **Leader/base deck can be 0 or 1.** Player may not pick an active leader/base on the sheet (incomplete or casual play). Lee's casual fixture has both at 0. Treat 0 as valid.
- **Card numbers don't match sheet print order.** Cards are listed alphabetically within each sub-aspect group on the sheet. Card 38 (Lepi Lookout) appears AFTER card 39 (Latts Razzi) because L-a < L-e alphabetically. Verified against the API; cards.json is correct.
- **Corrections on the sheet are flagged for human review, not auto-resolved.** When the player writes a digit then crosses it out (visible scribble), the sheet is structurally ambiguous. Treat as "unclear" / flag for resolve UI. Do NOT try to OCR what was crossed out vs what replaced it.
- **`*` markers in user-typed pristine truth.** When the user marks a value with `*` (e.g., `0 1*`), it indicates they changed the value from the model's guess. The parser strips `*` and uses the value as-is. Don't confuse with required syntax.
- **Tom's photo is 6MP, Lee's are 24MP.** Different photo capture resolutions. Different devices. The OMR pipeline must work robustly on both.

## Cost / API budget

- Current architecture: ~$1-2 per import for ~25 sub-group calls × 5-9 samples × Claude Opus 4.7.
- Per eval run (3 fixtures): ~$3-6.
- User's API balance: tracking ~$14 at session end. Auto-reload configured but with delays — credits sometimes hit 0 mid-run and the eval errors out.
- OMR target: ~$0 per import for the OMR pass + ~$0.05-0.20 for tiebreaker calls on ambiguous cells.

## What NOT to do

- **Don't push.** User has explicitly said `git push` is forbidden without permission, multiple times. The branch `feat/import-pool-spike` is local-only.
- **Don't add more LLM-only iteration.** That path has been mined out this session. The remaining gap (~10-15% recall, ~5-15% precision) is structural — model misalignment that voting can't rescue.
- **Don't propose Top-N selection on Leaders/Bases.** Already tried, regressed by 7 points. Documented above.
- **Don't propose temperature=0.** It eliminates voting's diversity benefit; locks in systematic biases.
- **Don't skip the validation gate.** OMR must beat the current LLM baseline on all 3 fixtures before merging into production.

## Recommended first action for next session

1. Read this file end-to-end.
2. Read [lib/anthropic.ts](../lib/anthropic.ts) and [src/services/importPool/sectionExtraction.ts](../src/services/importPool/sectionExtraction.ts) to understand current architecture.
3. Pick OMR runtime: Python sidecar (recommended) vs Node `opencv4nodejs` vs `sharp`-only. The user has not committed; ask them or default to Python sidecar.
4. Sketch the canonical grid for LAW. Use one of the 3 fixture photos as the reference. Save to `src/data/omr-templates/LAW.json`.
5. Build a one-shot script that takes one fixture's photo, runs OMR, outputs per-cell `{cardNumber, poolQty, deckQty, confidence}`. Validate manually against the fixture's pristine truth before integrating.
6. Once the one-shot proves >95% per-cell accuracy on at least one fixture, integrate into `extractPoolFromImages` and run the full eval.

Ship in increments. Don't try to integrate before the standalone script works.
