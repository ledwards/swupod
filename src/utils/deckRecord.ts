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
