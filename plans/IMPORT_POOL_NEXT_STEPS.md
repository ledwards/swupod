# Import Pool — Next Steps After Phase A Ship

## Current state (after softening section heuristics)

**Heuristic coverage measured by `scripts/eval-anomalies.ts` against three labeled fixtures:**

| Fixture | Real issues | Caught | Coverage |
|---|---|---|---|
| sq-tom-law | 11 | 6 | 55% |
| sq-lee-law | 32 | 10 | 31% |
| casual-lee-law | 10 | 1 | 10% |
| **Overall** | **53** | **17** | **32%** |

The Step-2 wizard surfaces these issues as yellow rows + section banners. The Step-3 confirm gate (pool=96, deck>=30, leader+base) is the safety net for the cases the heuristic doesn't catch.

## Closing the 32% → 100% gap

Three options, in increasing weight:

### (a) Tighter aggregate-signal heuristics — measurable, ~+10pp expected

What's still un-flagged: cases where extraction missed a specific row but the section's totals look fine. Example: tom Multicolor pool 12, in typical range 9-17, contains 3 missed cards. No aggregate signal points at them.

Possible additions:
- **Cross-section redistribution**: when one section is at the LOW end of typical AND another is at the HIGH end, flag both as suspect (one likely "stole" cards from the other in extraction).
- **Card-number gap detection**: extraction returns cards in card-number order. If the sequence skips numbers within a sub-section (e.g. extracted 138, 140, 141 — what happened to 139?), flag the missing number.
- **Aspect-pair bias**: if extraction's Multicolor aspect-pair distribution skews vs typical (e.g. all V-pairs, no C-pairs), flag.

These add pp but won't reach 100% — fundamentally limited.

### (b) Per-cell ML tiebreaker — the path to 100%, multi-week

Plan in [IMPORT_POOL_ML_CLASSIFIER.md](IMPORT_POOL_ML_CLASSIFIER.md) (from the prior handoff). Core idea:

1. Crop each PLAYED + TOTAL cell from the warped sheet image.
2. Train a small classifier (CNN or vision-LLM) on labeled crops.
3. On every extraction, run the classifier on every cell and use it as a tiebreaker against Opus's whole-table read.
4. Disagreements → flag.

Requires:
- ≥50 labeled photos (each ~96 cards × 2 cells = ~200 cell labels per photo).
- Cell-crop pipeline (Python sidecar already does the warp + table detection).
- Training infra + serving.

Estimated 4–8 weeks of focused work. Solves wrong-deck (which is 24/53 issues — 45% of the gap) and most miss/phantom cases. Would push coverage to 95%+.

### (c) Re-extract a section on demand — fast tactical option

When the user clicks "I think there's something missed in this section":
1. Send the cropped section image back to Opus with a focused prompt.
2. Compare new extraction to current; surface diffs as candidates.
3. Costs one extra Opus call per section the user flags (~$0.10).

User-driven precision boost. Complements (a) without the months-long training cycle of (b).

## Sheet-template detection — sub-section ordering

LAW sheet has sub-sections within main sections (e.g. Vigilance + Villainy, Vigilance + Heroism, Vigilance pure). The order on the printed sheet is template-specific; future sets may reorder.

Currently we use a hard-coded canonical order (X+Villainy → X+Heroism → X+X → X+other → X). Possible future:
- Have Opus return sub-section header labels as part of the extraction (one extra field per section).
- Use those labels to derive the correct order on a per-set basis.

Light lift; defer until a non-LAW sheet ships and the canonical order proves wrong.

## Recommended sequence

1. **Ship current state.** Step-3 totals are the safety net. User reviews each section in Step-2 manually.
2. **Add (c) re-extract section** as the user-driven escape hatch. Fast to implement.
3. **Iterate (a) heuristics** using `scripts/eval-anomalies.ts` as the closed-loop measurement. Target +10–15pp coverage.
4. **Plan (b) ML** when the team has bandwidth. The eval harness will measure its real gain over (a).
