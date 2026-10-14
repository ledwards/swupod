/**
 * Joins the per-cohort draft-pick tables (everyone, top players, you) into one
 * row per card for the Drafting tab, and compares your leader win rates with
 * the field's for the overview. Pure.
 */

export interface PickSourceRow {
  cardName: string
  avgPickPosition: number | null
  firstPickPct?: number | null
  timesPicked?: number | null
  [key: string]: unknown
}

export type PickCohortRow<T extends PickSourceRow = PickSourceRow> = T & {
  topAvgPick: number | null
  youAvgPick: number | null
  /** Picks earlier top players take it than everyone (positive = earlier). */
  topDelta: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

function byName(rows: PickSourceRow[] | null | undefined): Map<string, PickSourceRow> {
  return new Map((rows || []).map((r) => [r.cardName, r]))
}

export function buildPickCohortRows<T extends PickSourceRow>(
  all: T[],
  top: PickSourceRow[] | null | undefined,
  you: PickSourceRow[] | null | undefined,
): PickCohortRow<T>[] {
  const topMap = byName(top)
  const youMap = byName(you)
  return all.map((row) => {
    const topAvgPick = topMap.get(row.cardName)?.avgPickPosition ?? null
    const youAvgPick = youMap.get(row.cardName)?.avgPickPosition ?? null
    return {
      ...row,
      topAvgPick,
      youAvgPick,
      topDelta: topAvgPick != null && row.avgPickPosition != null ? round1(row.avgPickPosition - topAvgPick) : null,
    }
  })
}

export interface LeaderRecord {
  leaderName: string
  winRate: number
  matches: number
  leaderImageUrl?: string | null
  leaderBackImageUrl?: string | null
}

export interface YouVsFieldRow {
  leaderName: string
  imageUrl: string | null
  yourWinRate: number
  yourMatches: number
  fieldWinRate: number
  delta: number
}

export function buildYouVsField(
  mine: LeaderRecord[],
  field: LeaderRecord[],
  { minMatches = 3, limit = 4 }: { minMatches?: number; limit?: number } = {},
): YouVsFieldRow[] {
  const fieldMap = new Map(field.map((f) => [f.leaderName, f]))
  return mine
    .filter((m) => m.matches >= minMatches && (fieldMap.get(m.leaderName)?.matches || 0) > 0)
    .sort((a, b) => b.matches - a.matches)
    .slice(0, limit)
    .map((m) => {
      const f = fieldMap.get(m.leaderName)!
      return {
        leaderName: m.leaderName,
        imageUrl: f.leaderBackImageUrl || f.leaderImageUrl || m.leaderBackImageUrl || m.leaderImageUrl || null,
        yourWinRate: m.winRate,
        yourMatches: m.matches,
        fieldWinRate: f.winRate,
        delta: round1(m.winRate - f.winRate),
      }
    })
}
