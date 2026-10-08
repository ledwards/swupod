/**
 * Migration failure policy (U7, foundations hardening plan).
 *
 * Production must never serve traffic against a knowingly-stale schema:
 * when a startup migration fails in production the process exits non-zero
 * so the deploy stops (Railway restarts / rolls back) instead of booting a
 * silently degraded server.
 *
 * Escape hatch: set ALLOW_STALE_SCHEMA=1 to boot anyway — the documented
 * break-glass for "the migration is wedged but the running schema is
 * actually fine." Dev keeps the lenient warn-and-continue behavior so local
 * machines without a database still start.
 *
 * Both swallow layers consult this single definition:
 *   - scripts/migrate-on-deploy.ts (the migration orchestrator)
 *   - server.ts runMigrations() (the spawning parent)
 */

export interface MigrationPolicyEnv {
  NODE_ENV?: string
  ALLOW_STALE_SCHEMA?: string
}

/**
 * Decide whether a migration failure should stop the process.
 *
 * @returns true when NODE_ENV is 'production' and the ALLOW_STALE_SCHEMA
 *          hatch is not set to '1'; false otherwise (dev/test stay lenient).
 */
export function shouldFailFastOnMigrationFailure(
  env: MigrationPolicyEnv = process.env
): boolean {
  if (env.NODE_ENV !== 'production') return false
  return env.ALLOW_STALE_SCHEMA !== '1'
}
