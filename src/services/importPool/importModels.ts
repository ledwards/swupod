/**
 * The ONE place the Import Pool pipeline picks a Claude model.
 *
 * Each extraction operation has its own route because each was scored on
 * its own cases (scripts/eval/run-ops.ts); capability decides the tier, the
 * eval proves it. A call site asks for its operation and never names a model
 * literal itself — importModels.guard.test.ts fails the build if one does.
 *
 *   phase1 — header + per-table bounding boxes from the full photos
 *   table  — per-table tally read from a Phase-1 crop (legacy fallback path)
 *   omr    — whole-table / cell-strip read from an OMR sidecar crop (prod path)
 *
 * Env overrides, most specific first, read at call time so the eval harness
 * can A/B one operation without touching the others:
 *   IMPORT_<OP>_MODEL  (IMPORT_PHASE1_MODEL / IMPORT_TABLE_MODEL / IMPORT_OMR_MODEL)
 *   IMPORT_EXTRACT_MODEL  (every operation at once)
 */
export type ImportOperation = 'phase1' | 'table' | 'omr'

// Scored 2026-11-12 on the 5 verified fixtures (run-ops.ts). An operation
// drops a tier only if it scores within 1.3 pp of Opus — the run-to-run
// spread in plans/IMPORT_POOL_OMR_REPORT.md.
//   omr    Opus 5.5 99.0% / Sonnet 5.5 97.5% (-1.5 pp; -4 pp on sfpq-lee-law) → Opus
//   table  Opus 5.5 99.3% / Sonnet 5.5 99.1% (-0.2 pp, 2 runs)               → Sonnet
//   phase1 header leader/base Opus 5.5 80% / Sonnet 40% / Haiku 0%
//          (the wizard pre-selects the leader and base from it)              → Opus
export const IMPORT_MODEL_DEFAULTS: Record<ImportOperation, string> = {
  phase1: 'claude-opus-5-5',
  table: 'claude-sonnet-5-5',
  omr: 'claude-opus-5-5',
}

const OP_ENV: Record<ImportOperation, string> = {
  phase1: 'IMPORT_PHASE1_MODEL',
  table: 'IMPORT_TABLE_MODEL',
  omr: 'IMPORT_OMR_MODEL',
}

export function importModel(op: ImportOperation): string {
  return process.env[OP_ENV[op]] || process.env.IMPORT_EXTRACT_MODEL || IMPORT_MODEL_DEFAULTS[op]
}
