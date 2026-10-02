/**
 * Limited card-data contract shared by the stats API.
 *
 * Wayfinder owns performance. Pick snapshots stay set-wide. A request for one
 * set must not be rewritten into another set's era, and explicit dates travel
 * with the request.
 */

export interface WayfinderStatsQuery {
  setCode: string
  since?: string | null
  until?: string | null
  prerelease?: boolean
  baseUrl?: string | null
}

export function wayfinderEraForSet(setCode: string, prerelease = false): string | null {
  if (!setCode || setCode === 'all') return null
  return prerelease ? `${setCode}-pre-release` : setCode
}

export function wayfinderStatsUrl(query: WayfinderStatsQuery): string | null {
  const era = wayfinderEraForSet(query.setCode, query.prerelease === true)
  if (!era) return null
  const base = query.baseUrl || process.env.WAYFINDER_CARD_STATS_BASE_URL || 'https://plugin.wayfinder.news'
  const url = new URL('/api/cards/stats', base)
  url.searchParams.set('era', era)
  url.searchParams.set('format', 'limited')
  url.searchParams.set('sources', 'karabast,ptp')
  url.searchParams.set('limit', 'all')
  url.searchParams.set('excludeMirrors', 'true')
  if (query.since) url.searchParams.set('from', query.since)
  if (query.until) url.searchParams.set('to', query.until)
  return url.toString()
}

export interface GradeSignal {
  grade: string | null
  basis: string | null
  status: string | null
  statusLabel: string | null
  score: number | null
}

export interface ActiveRatingEntry {
  score: number
  grade: string | null
  basis: string
  version: string
}

export interface ActiveRatingSet {
  set: string
  status: 'published' | 'retained' | 'inconclusive' | 'insufficient' | 'failed'
  reason: string
  basis: string
  version: string
  cards: Record<string, ActiveRatingEntry>
  leaders: Record<string, ActiveRatingEntry>
}

export function identityKey(name: string | null | undefined, subtitle: string | null | undefined): string {
  return `${String(name || '').trim()}|${String(subtitle || '').trim()}`.toLowerCase()
}

export function activeEntryFor(
  manifest: Record<string, ActiveRatingSet> | null | undefined,
  setCode: string | null | undefined,
  name: string | null | undefined,
  subtitle: string | null | undefined,
  kind: 'card' | 'leader',
): ActiveRatingEntry | null {
  if (!manifest || !setCode) return null
  const set = manifest[setCode]
  if (!set || set.status !== 'published') return null
  const table = kind === 'leader' ? set.leaders : set.cards
  return table[identityKey(name, subtitle)] ?? null
}

function signal(grade: string | null, basis: string | null, status: string | null, statusLabel: string | null, score: number | null = null): GradeSignal {
  return { grade, basis, status, statusLabel, score }
}

/**
 * Record performance before pick grades replace the legacy `grade` field, then
 * record the pick grade after that replacement. Legacy `grade` is left as the
 * caller set it.
 */
export function snapshotPerformanceSignals<T extends { leaders?: any[]; bases?: any[]; cards?: any[] }>(payload: T): T {
  const decorate = (row: any) => ({
    ...row,
    performanceGrade: signal(
      row.performanceGrade?.grade ?? row.grade ?? null,
      row.performanceGrade?.basis ?? row.gradeBasis ?? null,
      row.performanceStatus ?? row.performanceGrade?.status ?? row.gradeStatus ?? null,
      row.performanceReason ?? row.performanceGrade?.statusLabel ?? row.gradeStatusLabel ?? null,
    ),
  })
  return {
    ...payload,
    leaders: (payload.leaders || []).map(decorate),
    bases: (payload.bases || []).map(decorate),
    cards: (payload.cards || []).map(decorate),
  }
}

export function attachPickAndActiveSignals<T extends { setCode?: string; leaders?: any[]; bases?: any[]; cards?: any[]; scope?: unknown }>(
  payload: T,
  manifest?: Record<string, ActiveRatingSet> | null,
): T {
  const setStatus = manifest && payload.setCode ? manifest[payload.setCode] : null
  const decorate = (row: any) => {
    const isLeader = Boolean(row?.isLeader) || String(row?.cardType || '').toLowerCase().includes('leader')
    const pick = String(row.gradePolicy || '').includes('pick')
      ? signal(row.grade ?? null, row.gradeBasis ?? null, row.gradeStatus ?? null, row.gradeStatusLabel ?? null, row.pickRating ?? null)
      : signal(null, null, 'unavailable', 'No pick snapshot for this set')
    const active = activeEntryFor(manifest, payload.setCode, row.cardName || row.name, row.subtitle, isLeader ? 'leader' : 'card')
    return {
      ...row,
      pickGrade: pick,
      activeRating: active
        ? signal(active.grade, active.basis, 'published', active.version, active.score)
        : signal(row.grade ?? null, row.gradeBasis ?? null, setStatus?.status ?? 'retained', setStatus?.reason ?? 'Current grade', null),
    }
  }
  return {
    ...payload,
    ratingStatus: setStatus?.status ?? 'retained',
    ratingReason: setStatus?.reason ?? null,
    leaders: (payload.leaders || []).map(decorate),
    bases: (payload.bases || []).map(decorate),
    cards: (payload.cards || []).map(decorate),
  }
}
