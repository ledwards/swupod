# Import Pool extraction eval

A small harness for measuring whether `extractPoolFromImages` reads sealed
registration sheets correctly. Each **fixture** is one photo pair plus a
hand-corrected ground truth; the runner scores extraction output against
each fixture and prints a single aggregate report.

Use it to answer "did this prompt change make things better or worse?"
without eyeballing logs.

## What's actually tested

The eval calls `extractPoolFromImages` directly on the raw phone photos
in each fixture. That's the same code path the production route handler
uses — including server-side image preprocessing in
[preprocessImage.ts](../../src/services/importPool/preprocessImage.ts)
(resize, normalise, contrast, sharpen). So the eval is a real proxy for
what a user sees when they upload a photo from their phone.

The browser-side resize in
[imagePrep.ts](../../src/services/importPool/imagePrep.ts) is *not*
exercised by the eval — but that step only resizes for upload size, so
the bytes hitting the server are equivalent to what the eval feeds
directly.

## Layout

```
scripts/eval/
  fixtures/
    sq-tom-law/                ← one folder per photo pair
      photo1.jpg               ← raw phone photo — gitignored, kept LOCAL only
      photo2.jpg               ← (player name + SWU ID is real-player data)
      ground-truth.json        ← hand-edited correct answer (committed)
    sq-lee-law/
    local-lee-law/
  run-eval.ts                  ← runner
  results/                     ← optional: timestamped runs (gitignored)
```

**Photos are gitignored.** Real registration sheets carry player names and
SWU IDs and shouldn't end up in the repo. Each contributor keeps their own
photo files in their local fixture directories. The `ground-truth.json`
files are committed so the eval shape is reproducible.

## Running

```bash
# All fixtures
npx tsx scripts/eval/run-eval.ts

# One fixture
FIXTURE=sq-tom-law npx tsx scripts/eval/run-eval.ts

# Save the run as a JSON snapshot you can diff later
SAVE=1 npx tsx scripts/eval/run-eval.ts

# Tune the iteration cap (default 8)
MAX_ITER=4 npx tsx scripts/eval/run-eval.ts
```

A fixture with empty `rows[]` in `ground-truth.json` is skipped — that's
how the placeholder fixtures stay out of the way until you fill them in.

Roughly 10-30 minutes per fixture; three fixtures end-to-end is 30-90 min.

## Creating a new fixture

1. Drop `photo1.jpg` and `photo2.jpg` (the raw phone photos, exactly as
   the user would upload them) into `fixtures/<name>/`.

2. Generate a starter ground truth from the model's best run:

   ```bash
   PHOTO1=scripts/eval/fixtures/<name>/photo1.jpg \
   PHOTO2=scripts/eval/fixtures/<name>/photo2.jpg \
   MAX_ITER=8 npx tsx scripts/iter-import.ts

   # then convert /tmp/iter-import-last.json → ground-truth.json (see existing fixture for shape)
   ```

3. **Edit by hand.** Open the photos and walk each section. For the
   model's marked rows: keep the right ones, remove hallucinations,
   correct qty values. Then add any rows the model missed entirely.

4. Drop the `_note` field once the rows are correct.

## Scoring

Per fixture:

| Metric           | Meaning                                                       |
| ---------------- | ------------------------------------------------------------- |
| invariants pass  | poolSum=96, deckSum∈[30-35], leaders=6, bases=6, deck⊆pool    |
| recall           | of cards in truth, what % did the model find                  |
| precision        | of cards in model output, what % are real                     |
| qty error mean   | avg \|model_qty − truth_qty\| across matched cards            |
| qty error max    | worst single-row qty miss                                     |
| iterations       | how many refine passes the loop ran                           |

Cards are matched by `type|name` (lowercase, alphanumeric only). Subtitle
is ignored for matching because the model and the human often disagree on
subtitle wording — it's not a real disagreement about *which card*.

## Workflow

```bash
# Baseline: how does main do today?
SAVE=1 npx tsx scripts/eval/run-eval.ts

# Try a prompt tweak in lib/anthropic.ts...

# Re-run, diff JSON outputs to see whether recall went up
SAVE=1 npx tsx scripts/eval/run-eval.ts
diff scripts/eval/results/<earlier>.json scripts/eval/results/<later>.json
```

## Per-operation model eval (`run-ops.ts`)

Each Claude operation in the pipeline is routed to its own model in
[importModels.ts](../../src/services/importPool/importModels.ts) — `phase1`
(header + table boxes), `omr` (whole-table read of an OMR crop, the prod
path) and `table` (per-table read of a Phase-1 crop, the legacy fallback).
`run-ops.ts` scores one operation at a time on the same fixtures, holding
everything but the model fixed (the OMR sidecar output is cached per fixture
in `results/sidecar-cache/`):

```bash
OPS=omr MODELS=claude-opus-5-5,claude-sonnet-5-5 RUNS=2 npx tsx scripts/eval/run-ops.ts
OPS=phase1 MODELS=claude-opus-5-5,claude-haiku-5-5 FIXTURE=sq-tom-law npx tsx scripts/eval/run-ops.ts
```

- `omr` / `table`: per-cell combined accuracy over every card of every
  detected table, the metric of `plans/IMPORT_POOL_OMR_REPORT.md`.
- `phase1`: mean IoU of each Phase-1 table box against the sidecar's box,
  plus header leader/base against the fixture's deck leader/base.

An operation moves down a tier only if it scores within the run-to-run
spread of the Opus runs on the same fixtures (1.3 pp in the OMR report).
Photos are found in this checkout's fixtures, then the main checkout's, or
`PHOTOS_DIR`. To try a model in the real pipeline, set
`IMPORT_<OP>_MODEL` (e.g. `IMPORT_OMR_MODEL=claude-sonnet-5-5`) or
`IMPORT_EXTRACT_MODEL` for every operation.
