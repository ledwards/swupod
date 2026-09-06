/**
 * Compatibility shim for `migrations/094_backfill_chaos_sealed_tracking.js`.
 *
 * The implementation moved to `boosterPoolTracking.ts` when Pack Wars and Pack Blitz
 * turned out to have the same untracked-pool gap. Migration 094 has already run in
 * production, so its import is left pinned here rather than edited: an applied
 * migration should keep working verbatim on any database that has not run it yet
 * (a fresh clone, or dev), and rewriting one to chase a rename is how a migration
 * quietly stops matching what actually ran.
 *
 * New code should import `buildBoosterPoolTrackingRecords` directly.
 */
export {
  buildBoosterPoolTrackingRecords as buildChaosSealedTrackingRecords,
  type BoosterPoolTrackingRecord as ChaosSealedTrackingRecord,
} from './boosterPoolTracking'
