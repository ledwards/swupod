/** One finished draft as `/api/draft/reports` returns it. */
export interface DraftReportEntry {
  draftShareId: string
  name: string | null
  setCode: string
  setName: string
  maxPlayers: number
  completedAt: string | null
  startedAt: string | null
  competitive: boolean
  seatNumber: number
  leaderName: string | null
  leaderBackImageUrl: string | null
  leaderAspects?: string[] | null
  baseName: string | null
  baseAspects: string[] | null
}

/** "Oct 10, 2026 · A Lawless Time · 8 players" (or "In progress · …"). */
export function reportMeta(r: DraftReportEntry): string {
  const when = r.completedAt
    ? new Date(r.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'In progress'
  return [when, r.setName, `${r.maxPlayers} players`].filter(Boolean).join(' · ')
}

/** The deck's aspects, leader first, each once. */
export function reportAspects(r: DraftReportEntry): string[] {
  return [...new Set([...(r.leaderAspects ?? []), ...(r.baseAspects ?? [])])]
}
