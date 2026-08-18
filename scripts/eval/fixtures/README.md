# Eval fixtures — what these are, and what they are NOT

These directories are **OCR/import-pool accuracy fixtures**: a `ground-truth.json`
plus (gitignored) `photo1.jpg` / `photo2.jpg`. `scripts/eval/run-eval.ts` reads a
photo pair, runs the extraction pipeline, and scores the result against the truth.

## Do not use these as collation ground truth

They look like a set of real sealed pools. They are not a clean sample of one,
and using them to reason about pack generation will give a wrong answer. This has
already happened once: a Kolmogorov-Smirnov test of duplicates-per-pool against
"the real LAW pools" REJECTED, and the rejection was an artifact of the three
problems below. See `docs/PACK_AUDIT_2026-08-18.md`.

Before treating any of these as physical-product evidence:

1. **`_note` means unverified.** A `_note` field marks a model-generated STARTER
   truth awaiting human review; `run-eval.ts` skips those so they cannot poison
   the aggregate. Five of the ten `*-law` fixtures carry one. They are not
   observations.
2. **Some fixtures share a pool.** `casual-lee-law` and `local-lee-law` hold
   byte-identical truths — the same physical pool, and (if photos are present)
   two different photo sets of it. That is legitimate for OCR scoring, where each
   photo set is a distinct test case. It is NOT legitimate for anything that
   counts pools, where it double-weights one sample.
3. **Some fixtures are generator output, not cards.** A truth carrying a
   `meta.shareId` / `meta.userId` (e.g. `sfpq-lee-law`) was exported from a PTP
   card pool — our own generator's product. Exact and therefore excellent for OCR
   scoring, but circular as evidence about how real packs collate.

After that filtering, the ten `*-law` directories yield **three** genuinely real,
independent LAW pools. Three is too few to conclude anything about collation.

## Adding a fixture

See `scripts/eval/regenerate-fixture.ts`. It writes a starter truth with `_note`
set; remove `_note` only after walking each table against the photos and fixing
hallucinated rows, missed rows, and quantity errors.
