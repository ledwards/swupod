export interface DeckRecordInput {
  wins?: number | string | null
  losses?: number | string | null
  draws?: number | string | null
}

export interface FormatRecordOptions {
  emptyLabel?: string
}

function toCount(value: number | string | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? '0'), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function formatRecord(
  winsOrRecord: DeckRecordInput | number | string | null | undefined,
  losses?: number | string | null,
  draws?: number | string | null,
  opts: FormatRecordOptions = {},
): string {
  const record = typeof winsOrRecord === 'object' && winsOrRecord !== null
    ? winsOrRecord
    : { wins: winsOrRecord, losses, draws }

  const wins = toCount(record.wins)
  const safeLosses = toCount(record.losses)
  const safeDraws = toCount(record.draws)
  const total = wins + safeLosses + safeDraws

  if (total === 0) return opts.emptyLabel || 'No games yet'

  const winRate = Math.round((wins / total) * 100)
  return `${wins}W-${safeLosses}L-${safeDraws}D (${winRate}%)`
}

/**
 * Whether a Wayfinder match id can be rendered as a `/matches/<id>` link.
 *
 * Only real captured-game ids resolve to a match page. Synthetic placeholders —
 * e.g. `manual-recover-g2`, stamped when a game is manually recovered without a
 * captured replay — do NOT, and rendering them produced a spurious "Match 1"
 * link to a dead page. Empty/whitespace ids are also rejected.
 */
export function isRenderableMatchId(id: string | null | undefined): boolean {
  if (typeof id !== 'string') return false
  const trimmed = id.trim()
  if (trimmed === '') return false
  if (trimmed.startsWith('manual-recover')) return false
  return true
}
