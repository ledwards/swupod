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
  setCode: string
  /** Display label, e.g. "LAW · A Lawless Time". */
  label: string
  /** Inclusive start (YYYY-MM-DD) — the set's release date. */
  start: string
  /** Exclusive-ish end (YYYY-MM-DD) — next set's release, or today. */
  end: string
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

/**
 * All eras, most recent first. Includes the next upcoming set (e.g. ASH) so it
 * can be selected before release — its era is forward-looking and gated behind
 * Friend-of-the-Pod early access; non-members see a join CTA instead of data.
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

  const released = all.filter((s) => s.release <= today)

  const eras: Era[] = released
    .map((s, i) => {
      const next = released[i + 1]
      const end = next ? next.release : today
      return {
        setCode: s.code,
        label: `${s.code} · ${s.name}`,
        start: s.release,
        end: end < today ? end : today,
      }
    })
    .filter((e) => e.start <= today)
    .reverse()

  // Prepend the nearest upcoming set (the "next set") as the most-recent era.
  const upcoming = all.filter((s) => s.release > today)[0]
  if (upcoming) {
    eras.unshift({
      setCode: upcoming.code,
      label: `${upcoming.code} · ${upcoming.name}`,
      start: upcoming.prerelease,
      end: today > upcoming.prerelease ? today : upcoming.prerelease,
    })
  }

  return eras
}

/** The era containing `today`, or the most recent started era. */
export function getCurrentEra(eras: Era[], today: string = todayStr()): Era | null {
  if (eras.length === 0) return null
  return eras.find((e) => e.start <= today && today < e.end) || eras[0] || null
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
