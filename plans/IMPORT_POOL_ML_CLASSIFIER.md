# Plan: Per-Cell ML Classifier for Import Pool (path to ≥99%)

**Status:** Future work. Not started.
**Owner:** TBD
**Estimated effort:** 4-8 weeks (1 person), front-loaded on data collection.
**Prerequisites:** Whole-table Opus pipeline in production (DONE in commit 6b32bfe).

## Goal

Push per-cell accuracy from the current ~97% (whole-table Opus) to ≥99% strict, eliminating the ~5-15 cells per import that currently slip through (~24/27 of which concentrate on player-correction sheets).

This is the path to an "auto-accept everything" UX where users almost never need to manually correct extracted pools.

## Why this is the right next step

The current architecture caps at ~97% because of two failure modes that no prompt change has fixed:
1. **Faint/ambiguous marks**: light pencil marks Opus reads as 0
2. **Player corrections**: crossed-out and rewritten marks where Opus picks the wrong value

Both are inherently visual-classification problems on small image patches. Claude is GENERAL — it does fine on most cells but stumbles on hard ones. A purpose-trained classifier on a labeled dataset of HARD cells will outperform Claude on this specific task.

Claude's 97% is essentially the no-training-data ceiling. To break it we need labels.

## Architecture

The ML classifier is a TIEBREAKER on cells where whole-table Opus is uncertain — not a replacement.

```
┌──────────────────────────────────────────────────────────────┐
│ Per-import flow (with ML tiebreaker)                          │
│                                                                │
│  1. OMR sidecar → table crops                                 │
│  2. Whole-table Opus (current production path)                │
│         ↓                                                      │
│     produces (pool, deck, p_unclear, t_unclear) per cell      │
│         ↓                                                      │
│  3. For cells where Opus flagged unclear OR violates an        │
│     invariant (LEADER pool ≠ 6, total pool ≠ 96):              │
│         a. Crop the cell from the warped image                 │
│         b. Run per-cell ML classifier                          │
│         c. Compare ML vs Opus; if disagree, use ML if its      │
│            confidence is high; else flag for human review      │
└──────────────────────────────────────────────────────────────┘
```

This is conservative: ML only runs on the small subset of cells (~5% of total) that are uncertain. On clean cells, Opus's 99%+ accuracy is fine and we save the ML inference cost.

## Phases

### Phase 1: Data collection (weeks 1-3)

**Target: 50+ photos × ~250 cells = 12,500+ labeled cells.**

#### Source ideas

1. **In-product annotation**: every time a user manually corrects an extracted cell in the resolve UI, log: `(cell_image, claude_prediction, user_correction)`. After a few hundred imports we'd have a natural dataset of HARD cases.

2. **Active recruiting**: ask a handful of patrons/playtesters to take photos of their own sealed pools and submit ground truth via a one-page form. ~15 min per pool × 30 pools = ~7.5 hours of work. $50 gift cards × 30 = $1500 budget.

3. **Synthetic augmentation**: take the 3 existing fixtures and apply controlled augmentations (rotation ±5°, brightness shifts, JPEG noise) to produce ~30 additional labeled photos. This won't capture hard correction cases but does help with general robustness.

4. **Synthetic generation**: programmatically render registration sheets with random tally patterns at known positions. Only useful if we can match the visual style of real photos closely (probably hard).

**Recommendation:** Combine #1 (in-product, ~500 corrections over 2 months of production traffic) and #2 (active recruiting, 15-20 photos in week 1-2). Skip synthetic for v1.

#### Data format

Per cell, store:
```json
{
  "cell_id": "lee-2026-05-08-photo1-LAW-008-PLAYED",
  "image": "base64-encoded-PNG-of-the-cell-crop",  // ~30x60px
  "label": 0 | 1 | 2 | 3 | "correction" | "unclear",
  "context": {
    "card_id": "LAW-008",
    "card_name": "Director Krennic",
    "table": "Leaders",
    "column": "PLAYED",
    "fixture": "lee-corrections-2026-05",
    "annotator": "user-id or admin-id"
  },
  "captured_at": "2026-05-15T10:23:00Z"
}
```

Store in S3 + a Postgres index for queryability. Or just S3 with structured filenames.

#### Annotation tooling

- Build a one-page React app: shows a cell image at 4x zoom + 6 buttons (0, 1, 2, 3, correction, unclear)
- Reviewer clicks the right button; record the (image, label) pair
- Add support for "skip" and "show me the full row for context"
- Inter-annotator agreement: have 2 people label the same 100 cells; report kappa

### Phase 2: Model training (week 4)

**Target: train a small CNN on the labeled dataset.**

#### Architecture choice

Two options:
1. **Fine-tune a small vision backbone** (MobileNetV3-Small, 2-3M params) on the labeled cells. Outputs 5-class softmax over {0, 1, 2, 3+, correction}.
2. **Custom shallow CNN** (3-4 conv layers, ~500K params). Faster to train, easier to deploy, sufficient for a binary-ish classification task.

**Recommendation:** Start with option 2. The task is simple enough that a from-scratch CNN trained on 12k cells should hit 99%+. If it doesn't, escalate to option 1.

#### Training setup

- 80/10/10 train/val/test split, stratified by table type
- Cross-entropy loss
- Augmentations: rotation ±3°, brightness ±20%, JPEG quantization simulation
- Standard PyTorch / Lightning training loop
- Ship as ONNX for inference (avoids Python dependency in the Node service)

#### Eval metrics

- Per-class accuracy
- Confusion matrix (especially: 0 vs 1, 1 vs 2)
- Calibration: ECE on validation set (we want confidence to be meaningful)
- **Held-out test on the 3 LAW fixtures**: target ≥99% per-cell on the 27 currently-failing cells

### Phase 3: Inference deployment (week 5)

**Target: integrate ML classifier into the production import flow.**

#### Deployment options

A. **ONNX Runtime in Node**: load the model in the Next.js process via `onnxruntime-node`. Pros: no extra service. Cons: ~50-100MB of native deps in the Node bundle.

B. **Python sidecar**: load the model in `extract_for_node.py` and add a `classify_cell` API. Pros: reuses the existing sidecar; no extra Node deps. Cons: per-cell Python invocation latency.

C. **Separate microservice**: deploy the classifier as a tiny Python+ONNX FastAPI service on Railway, called via HTTP. Pros: independent scaling; can use GPU. Cons: extra service to manage.

**Recommendation:** Start with B (Python sidecar). Add `classify_cells(crops: list[base64]) → list[label, confidence]` to `extract_for_node.py`. The Python startup cost is amortized across the ~5-15 cells per import. If/when call volume justifies, migrate to C.

#### Integration into `extractPoolFromImagesWholeTable`

```typescript
// After per-table whole-table Opus calls:
const uncertainCells = collectUncertainCells(tableResults);
//   - cells where Opus flagged p_unclear or t_unclear
//   - cells in tables that violate invariants (LEADER pool != 6 etc)

const mlResults = await mlClassifyCells(uncertainCells);  // calls Python sidecar

// For each uncertain cell, override Opus's prediction with ML's if ML is high-confidence
for (const cell of uncertainCells) {
  const ml = mlResults[cell.id];
  if (ml.confidence > 0.95) {
    overridePrediction(cell, ml.label);
  } else {
    flagForHumanReview(cell);
  }
}
```

### Phase 4: Continuous improvement (ongoing)

Once the classifier is shipped:

1. **Active learning**: every cell the user manually corrects in the resolve UI becomes a new training example. Retrain monthly.
2. **Drift monitoring**: track per-class accuracy on the rolling production traffic. Alert if class balance shifts (e.g., new set has very different mark patterns).
3. **Per-set models**: if accuracy varies wildly by set (LAW vs SOR vs future sets), train per-set classifiers.

## Cost budget

| Item | Estimate |
|---|---|
| Labeling time (in-product + recruiting) | ~$1500 in gift cards / annotator time |
| Training compute (single GPU rented for ~10 hours) | ~$20 |
| Storage (S3 for 50k cell images @ ~5KB each = 250MB) | ~$0.05/month |
| ONNX Runtime in production (CPU inference, ~10ms per cell) | negligible |
| **Total upfront** | **~$1600** |

## Risks and pre-mortems

### Risk 1: Insufficient hard-case data

Most cells in the wild are unambiguous (clean tally marks). The classifier needs to be GOOD AT HARD CASES specifically. If our 12k labeled cells are dominated by easy 0/1 cells, the classifier will overfit to those and fail to break the 97% ceiling.

**Mitigation:** Stratified sampling — keep labeling until we have ≥1000 examples per class for {correction, 2, 3+}. May require synthetic augmentation or targeted data collection.

### Risk 2: Distribution shift across sets

LAW marks may look different from future-set marks (different sheet design, different paper, different printer ink). A classifier trained on LAW could degrade on a new set's first day.

**Mitigation:** Hold out 10% of fixtures per set during training; measure cross-set generalization. Plan per-set fine-tuning if needed.

### Risk 3: Annotation noise

Two human annotators may disagree on what counts as a "correction" vs a "1 mark" vs a "smudge". If inter-annotator agreement is below 90%, the model can't exceed 90% accuracy.

**Mitigation:** Write a clear annotation guide; double-label 10% of dataset; report kappa publicly with the model.

### Risk 4: Doesn't beat Opus

Maybe a small CNN can't match Opus on this task and the project stalls.

**Mitigation:** Start with hardest 100 cells (the ones Opus gets wrong on the 3 LAW fixtures). Train on 1000 augmented variants of those. If the classifier can't beat Opus on those specifically, abandon and stick with whole-table Opus + human review for the long tail.

### Risk 5: Operational complexity

Adding a Python ML service to the Node-only stack is real complexity. We already have Python (the OMR sidecar), so this is incremental. But there's still: model versioning, model file deployment, CI to retrain, drift monitoring.

**Mitigation:** Keep the model SIMPLE. ONNX file checked into git (~5MB). Inference via the existing Python sidecar. Skip MLOps tooling for v1.

## Decision points

After Phase 1 (data collection):
- If labeled dataset is < 5k cells: pause and reconsider sourcing strategy
- If inter-annotator agreement < 90%: rewrite the annotation guide

After Phase 2 (training):
- If held-out test accuracy < 99%: decide between scaling data, scaling model, or accepting the current ~97% ceiling
- If accuracy ≥ 99% but inference is too slow: optimize before deploying

After Phase 3 (deployment):
- A/B test: 50% production traffic uses ML tiebreaker, 50% doesn't
- Compare resolve-UI manual-correction rate between the two cohorts
- Ship to 100% if ML cohort has measurably fewer manual corrections

## What this DOESN'T do

- **Doesn't replace Opus.** Whole-table Opus stays as the primary classifier. ML is only invoked on uncertain cells.
- **Doesn't help with new sets** until we collect data for them.
- **Doesn't address sheet-design changes** (e.g. if FFG ships a new format, the classifier needs retraining).
- **Doesn't make the system 100%.** Even at 99.5%, ~1 cell per import will be wrong. Resolve UI stays the safety net.

## Alternative paths considered

### Per-fixture hand-annotated ROI templates
Build a precise pixel-template per LAW (and per future set). Pixel-precise crop → simpler classifier (threshold-based) suffices.

**Why not:** Per-set manual work doesn't scale. Every new set release would need ~4 hours of manual ROI annotation.

### LLM ensemble (Claude + GPT-4 Vision + Gemini)
Vote across multiple frontier models on uncertain cells.

**Why not:** Tested in this session — voting doesn't help (when Claude is wrong, others tend to be wrong too, especially on the same hard cases). Adds complexity and per-call cost without accuracy gain.

### Higher-resolution single Claude call
Send a 4000+ px table image to Opus.

**Why not:** Anthropic image limits cap at ~2400px. Tried 2400px in this session — marginal improvement, not enough.

## Why now is NOT the time

Until we have 50+ labeled photos, we can't even pretrain a baseline. The whole-table Opus path is good enough for production rollout. Start data collection AFTER the new architecture is shipped to all users — that gives us:
1. Production traffic to mine for hard cases
2. Real accuracy measurement at scale
3. User-corrected-in-UI feedback as training labels

So the rough sequence is:
1. **NOW**: ship whole-table Opus (DONE)
2. **Month 1-2 after launch**: collect production-corrected labels passively (~500 cells); recruit 10-15 patron-submitted photos for active labeling
3. **Month 2-4**: train + evaluate
4. **Month 4-6**: deploy + A/B test + iterate

If the labeled dataset doesn't materialize at the expected rate, we either accept ~97% as the long-term ceiling or invest more in active recruiting.
