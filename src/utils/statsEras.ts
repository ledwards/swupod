/**
 * statsEras — derive competitive "eras" and their weeks from set release dates.
 *
 * An era is the window a set is the newest limited set: [releaseDate, next
 * set's releaseDate). The current era runs from the latest released set to
 * today. Weeks are Monday-aligned sub-ranges within an era, most recent first.
 *
 * Used by the /me page so the date-range dropdown can be constrained to the
 * weeks of the selected era.
 */
import { getSetConfig, getAllSetCodes } from './setConfigs/index'

export interface Era {
  /** Stable filter id, e.g. "LAW" or "ASH-pre-release". */
  id: string
  setCode: string
  /** Display label, e.g. "LAW · A Lawless Time". */
  label: string
  /** Inclusive start (YYYY-MM-DD) — the set's release date. */
  start: string
  /** Exclusive-ish end (YYYY-MM-DD) — next set's release, or today. */
  end: string
  /** Online card pool filter for overlapping preview eras. */
  cardPool?: 'Next Set'
}

export interface Week {
  start: string
  end: string
  label: string
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function todayStr(): string {
  return isoDate(new Date())
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

/** Monday of the week containing d (Monday = start of week). */
function mondayOf(d: Date): Date {
  const dow = (d.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  return addDays(d, -dow)
}

function rangeLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${fmt(start)} – ${fmt(end)}`
}

const PRE_RELEASE_ERAS = [
  { setCode: 'ASH', previousSetCode: 'LAW', cardPool: 'Next Set' as const },
]

/**
 * All eras, most recent first. Preview eras overlap the previous set's normal
 * era because online play uses the upcoming set code with the Next Set card
 * pool before tabletop release.
 */
export function getEras(today: string = todayStr()): Era[] {
  const all = getAllSetCodes()
    .map((code) => {
      const cfg = getSetConfig(code)
      return cfg && cfg.releaseDate
        ? { code, release: cfg.releaseDate, name: cfg.setName || code, prerelease: cfg.prereleaseDate || cfg.releaseDate }
        : null
    })
    .filter((x): x is { code: string; release: string; name: string; prerelease: string } => x != null)
    .sort((a, b) => a.release.localeCompare(b.release)) // ascending by release

  const eras: Era[] = all
    .map((s, i) => {
      const next = all[i + 1]
      return {
        id: s.code,
        setCode: s.code,
        label: `${s.code} · ${s.name}`,
        start: s.release,
        end: next ? next.release : today,
      }
    })
    .filter((e) => e.start <= today)

  for (const preview of PRE_RELEASE_ERAS) {
    const set = all.find((s) => s.code === preview.setCode)
    const previousSet = all.find((s) => s.code === preview.previousSetCode)
    if (!set || !previousSet || previousSet.release > today) continue

    eras.push({
      id: `${set.code}-pre-release`,
      setCode: set.code,
      label: `${set.code} Pre-Release`,
      start: previousSet.release,
      end: set.release,
      cardPool: preview.cardPool,
    })
  }

  return eras.sort((a, b) => {
    const startOrder = b.start.localeCompare(a.start)
    if (startOrder !== 0) return startOrder

    const previewOrder = Number(Boolean(b.cardPool)) - Number(Boolean(a.cardPool))
    if (previewOrder !== 0) return previewOrder

    return b.end.localeCompare(a.end)
  })
}

/**
 * The era containing `today`, else the most recent era that has already begun.
 * Never a purely-future era (e.g. the upcoming ASH set before its window opens)
 * — defaulting /me to a future window would show "no captured games / 0 packs".
 * `eras` is newest-first.
 */
export function getCurrentEra(eras: Era[], today: string = todayStr()): Era | null {
  const dateOnlyEras = eras.filter((e) => !e.cardPool)
  if (dateOnlyEras.length === 0) return null
  return (
    dateOnlyEras.find((e) => e.start <= today && today < e.end) ||
    dateOnlyEras.find((e) => e.start <= today) ||
    dateOnlyEras[dateOnlyEras.length - 1] ||
    null
  )
}

/**
 * Monday-aligned weeks within an era (clamped to the era window and today),
 * most recent first.
 */
export function getWeeks(era: Era, today: string = todayStr()): Week[] {
  const start = parseDate(era.start)
  const cap = parseDate(era.end < today ? era.end : today)
  if (cap < start) return []

  const weeks: Week[] = []
  let ws = mondayOf(start)
  let guard = 0
  while (ws <= cap && guard < 200) {
    guard += 1
    const we = addDays(ws, 6)
    const clampStart = ws < start ? start : ws
    const clampEnd = we > cap ? cap : we
    weeks.push({
      start: isoDate(clampStart),
      end: isoDate(clampEnd),
      label: rangeLabel(clampStart, clampEnd),
    })
    ws = addDays(ws, 7)
  }
  return weeks.reverse()
}
