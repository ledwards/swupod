/**
 * The two spend limits on the Import Pool pipeline.
 *
 * WHY THIS EXISTS (2026-11-19)
 *
 * A normal import costs well under a dollar (~$0.22 at the 2026-11-12 model
 * routing). Two things could make it cost far more, and neither had a bound:
 *
 * 1. THE LEGACY FALLBACK. When the whole-table path threw, the extractor fell
 *    back automatically to the legacy multi-sample loop. That loop was measured
 *    at $18.03 a sheet (166 calls, 683K input tokens, 0% cache hits) for 80-90%
 *    recall, against 95%+ on the path it replaces — see
 *    docs/IMPORT_POOL_EXTRACTION_FINDINGS.md. Its own response already warns
 *    that the section crops will not line up. And the usual reason the primary
 *    path throws is an upstream outage, which the fallback hits too. So the
 *    fallback is now OFF unless an operator turns it on; a failed import fails
 *    and the user retries.
 *
 * 2. VOLUME. Only patrons and admins can import, but nothing limited how often.
 *    Each user now gets a rolling 24-hour allowance per kind of job.
 *
 * Both are read at call time so they can be changed without a deploy.
 */

export type ImportJobKind = 'extract' | 'section'

/** IMPORT_LEGACY_FALLBACK=1 re-enables the $18-a-sheet legacy path. */
export function legacyFallbackEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.IMPORT_LEGACY_FALLBACK === '1'
}

/**
 * A full extract reads two photos end to end; a section re-read is one table.
 * 40 extracts is more sheets than one person registers in a day, and bounds a
 * single account at roughly $10 a day on the primary path.
 */
export const IMPORT_DAILY_LIMIT_DEFAULTS: Record<ImportJobKind, number> = {
  extract: 40,
  section: 200,
}

const LIMIT_ENV: Record<ImportJobKind, string> = {
  extract: 'IMPORT_EXTRACT_DAILY_LIMIT',
  section: 'IMPORT_SECTION_DAILY_LIMIT',
}

/** Jobs of this kind one user may start per rolling 24 hours. 0 blocks all. */
export function importDailyLimit(kind: ImportJobKind, env: Record<string, string | undefined> = process.env): number {
  const raw = env[LIMIT_ENV[kind]]
  if (raw === undefined || raw.trim() === '') return IMPORT_DAILY_LIMIT_DEFAULTS[kind]
  const parsed = Number(raw)
  // Garbage must not read as "unlimited".
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : IMPORT_DAILY_LIMIT_DEFAULTS[kind]
}

export class ImportLimitError extends Error {
  readonly kind: ImportJobKind
  readonly limit: number
  constructor(kind: ImportJobKind, limit: number) {
    super(`Daily import limit reached (${limit} per 24 hours). Try again later.`)
    this.name = 'ImportLimitError'
    this.kind = kind
    this.limit = limit
  }
}
