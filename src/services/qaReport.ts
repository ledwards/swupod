/**
 * QA report (alpha /qa): pure helpers that turn the existing QA data
 * (`/api/stats/qa`, `/api/public/pack-quality`, `duplicateStats.json`,
 * `/api/stats/packs`) into one status vocabulary: Pass / Watch / Fail / No Data.
 *
 * Nothing here recomputes a metric; it only reads the verdict each source
 * already carries and maps it.
 */

export type QAStatus = 'pass' | 'watch' | 'fail' | 'none'

export const QA_STATUS_LABEL: Record<QAStatus, string> = { pass: 'Pass', watch: 'Watch', fail: 'Fail', none: 'No Data' }

/** Rate / χ² / duplicate-metric status from packQualityService (95% / 99% z bands). */
export function metricStatus(status: string | null | undefined): QAStatus {
  if (status === 'expected') return 'pass'
  if (status === 'slight_variance') return 'watch'
  if (status === 'outlier') return 'fail'
  return 'none'
}

/** Structural check status. 'warning' is what the service reports when no packs were tracked. */
export function structuralStatus(status: string | null | undefined): QAStatus {
  if (status === 'pass') return 'pass'
  if (status === 'fail') return 'fail'
  return 'none'
}

/** Quality-score band (excellent ≥95, good ≥85, acceptable ≥70). */
export function healthStatus(status: string | null | undefined): QAStatus {
  if (status === 'excellent' || status === 'good') return 'pass'
  if (status === 'acceptable') return 'watch'
  if (status === 'needs_attention') return 'fail'
  return 'none'
}

/** Actual-vs-simulated duplicate verdict from duplicateStats.json. */
export function duplicateVerdictStatus(verdict: string | null | undefined): QAStatus {
  if (verdict === 'consistent') return 'pass'
  if (verdict === 'minor-drift') return 'watch'
  if (verdict === 'investigate') return 'fail'
  return 'none'
}

/** Worst status wins; No Data only when nothing has data. */
export function worstStatus(statuses: QAStatus[]): QAStatus {
  if (statuses.includes('fail')) return 'fail'
  if (statuses.includes('watch')) return 'watch'
  if (statuses.includes('pass')) return 'pass'
  return 'none'
}

export interface QATestResult {
  name: string
  suite: string
  status: 'passed' | 'failed'
  executionTime?: number
  errorMessage?: string
}

export const GENERAL_GROUP = 'General'

/** "SOR: all packs have 16 cards" → "SOR". Names without a set prefix → null. */
export function testSetCode(name: string): string | null {
  const m = /^([A-Z][A-Z0-9]{1,4}):\s/.exec(name)
  return m ? m[1] ?? null : null
}

export interface QATestGroup {
  key: string
  status: QAStatus
  passed: number
  failed: number
  tests: QATestResult[]
}

/**
 * One group per set: every set in `setOrder` (No Data when the run has no tests
 * for it), then any other set prefix found in the run, then unprefixed tests
 * as "General". Binary test results only give Pass or Fail.
 */
export function groupTestsBySet(tests: QATestResult[], setOrder: readonly string[]): QATestGroup[] {
  const buckets = new Map<string, QATestResult[]>()
  for (const code of setOrder) buckets.set(code, [])
  const extras: string[] = []
  const general: QATestResult[] = []
  for (const test of tests) {
    const code = testSetCode(test.name)
    if (!code) { general.push(test); continue }
    if (!buckets.has(code)) { buckets.set(code, []); extras.push(code) }
    buckets.get(code)!.push(test)
  }
  const keys = [...setOrder, ...extras.sort()]
  const groups = keys.map((key) => toGroup(key, buckets.get(key) || []))
  if (general.length) groups.push(toGroup(GENERAL_GROUP, general))
  return groups
}

function toGroup(key: string, tests: QATestResult[]): QATestGroup {
  const failed = tests.filter((t) => t.status === 'failed').length
  const passed = tests.length - failed
  const status: QAStatus = tests.length === 0 ? 'none' : failed > 0 ? 'fail' : 'pass'
  return { key, status, passed, failed, tests }
}

/**
 * Bar scale for an observed-vs-expected row: the expected rate's dashed
 * outline always lands at two thirds of the track, so a long or short fill
 * reads as above or below expected whatever the rate's size.
 */
export function rateScale(observed: number, expected: number): number {
  return Math.max(expected * 1.5, observed * 1.1, 1e-9)
}

/** Share of a scale as a CSS width, clamped to the track. */
export function barWidth(value: number, max: number): string {
  if (!max || !Number.isFinite(value)) return '0%'
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`
}

/** Per-pool evidence line status: |z| over 3 fails, over 2 is worth watching. */
export function zStatus(value: number, expected: number, stdDev: number): QAStatus {
  const z = Math.abs(value - expected) / (stdDev || 1)
  if (z > 3) return 'fail'
  if (z > 2) return 'watch'
  return 'pass'
}
