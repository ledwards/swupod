export type PtpPlaySeat = 'player1' | 'player2'
export type PtpPlayMatchResult = PtpPlaySeat | 'draw'
export type PtpPlayReportedResult = 'win' | 'loss' | 'draw'
export type PtpPlayRuntimeMode = 'local_stub' | 'forceteki'
export type PtpPlayMatchStatus =
  | 'matched'
  | 'launch_ready'
  | 'in_progress'
  | 'complete'
  | 'failed'
  | 'cancelled'
export type PtpPlayQueueStatus = 'queued' | 'matched' | 'cancelled' | 'expired' | 'launch_failed'

export interface DeckBuilderSummaryInput {
  shareId: string
  setCode: string
  setName?: string | null
  poolType?: string | null
  name?: string | null
  deckBuilderState?: unknown
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
}

export interface PlayDeckSummary {
  poolShareId: string
  setCode: string
  setName: string | null
  poolType: string
  name: string
  leaderName: string | null
  baseName: string | null
  mainDeckCount: number
  ready: boolean
  blocker: string | null
  createdAt: string | null
  updatedAt: string | null
}

const MIN_LIMITED_DECK_SIZE = 30

export class PtpPlayError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'PtpPlayError'
  }
}

export function resultFromReporterPerspective(
  reportedResult: PtpPlayReportedResult,
  reporterSeat: PtpPlaySeat
): PtpPlayMatchResult {
  if (reportedResult === 'draw') return 'draw'
  if (reportedResult === 'win') return reporterSeat
  return reporterSeat === 'player1' ? 'player2' : 'player1'
}

export function winnerUserIdForResult(
  result: PtpPlayMatchResult,
  match: { player1UserId: string; player2UserId: string }
): string | null {
  if (result === 'draw') return null
  return result === 'player1' ? match.player1UserId : match.player2UserId
}

export function seatForUser(
  match: { player1UserId: string; player2UserId: string },
  userId: string
): PtpPlaySeat | null {
  if (match.player1UserId === userId) return 'player1'
  if (match.player2UserId === userId) return 'player2'
  return null
}

export function oppositeSeat(seat: PtpPlaySeat): PtpPlaySeat {
  return seat === 'player1' ? 'player2' : 'player1'
}

export function summarizeDeckBuilderState(input: DeckBuilderSummaryInput): PlayDeckSummary {
  const state = asObject(parseMaybeJson(input.deckBuilderState))
  const cardPositions = asObject(state?.cardPositions)
  const activeLeader = stringOrNull(state?.activeLeader)
  const activeBase = stringOrNull(state?.activeBase)
  const leaderCard = activeLeader ? asObject(asObject(cardPositions?.[activeLeader])?.card) : null
  const baseCard = activeBase ? asObject(asObject(cardPositions?.[activeBase])?.card) : null
  const leaderName = cardName(leaderCard)
  const baseName = cardName(baseCard)
  const mainDeckCount = countMainDeckCards(cardPositions)
  const poolType = normalizePoolType(input.poolType)
  const name = deckName(input, state, poolType)
  const blocker = deckBlocker({
    hasLeader: Boolean(leaderName),
    hasBase: Boolean(baseName),
    mainDeckCount,
  })

  return {
    poolShareId: input.shareId,
    setCode: input.setCode,
    setName: input.setName ?? null,
    poolType,
    name,
    leaderName,
    baseName,
    mainDeckCount,
    ready: blocker === null,
    blocker,
    createdAt: dateStringOrNull(input.createdAt),
    updatedAt: dateStringOrNull(input.updatedAt),
  }
}

export function normalizeReportedResult(value: unknown): PtpPlayReportedResult | null {
  return value === 'win' || value === 'loss' || value === 'draw' ? value : null
}

export function normalizeMatchResult(value: unknown): PtpPlayMatchResult | null {
  return value === 'player1' || value === 'player2' || value === 'draw' ? value : null
}

export function normalizeSeat(value: unknown): PtpPlaySeat | null {
  return value === 'player1' || value === 'player2' ? value : null
}

export function buildLocalRuntimeUrl(matchId: string, launchToken: string): string {
  const encodedMatchId = encodeURIComponent(matchId)
  const encodedToken = encodeURIComponent(launchToken)
  return `/play/runtime/${encodedMatchId}?seatToken=${encodedToken}`
}

export function buildLocalReplayUrl(matchId: string): string {
  return `/play/runtime/${encodeURIComponent(matchId)}/replay`
}

function deckBlocker({
  hasLeader,
  hasBase,
  mainDeckCount,
}: {
  hasLeader: boolean
  hasBase: boolean
  mainDeckCount: number
}): string | null {
  if (!hasLeader) return 'Choose a leader before queueing.'
  if (!hasBase) return 'Choose a base before queueing.'
  if (mainDeckCount < MIN_LIMITED_DECK_SIZE) {
    return `Add ${MIN_LIMITED_DECK_SIZE - mainDeckCount} more main-deck cards before queueing.`
  }
  return null
}

function normalizePoolType(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : 'sealed'
}

function deckName(
  input: DeckBuilderSummaryInput,
  state: Record<string, unknown> | null,
  poolType: string
): string {
  const stateName = stringOrNull(state?.poolName)
  if (stateName) return stateName
  if (input.name) return input.name

  const format = poolType === 'draft'
    ? 'Draft'
    : poolType === 'rotisserie'
      ? 'Rotisserie'
      : 'Sealed'
  return `${input.setCode} ${format}`
}

function countMainDeckCards(cardPositions: Record<string, unknown> | null): number {
  if (!cardPositions) return 0

  let total = 0
  for (const rawPosition of Object.values(cardPositions)) {
    const position = asObject(rawPosition)
    if (!position) continue
    if (position.section !== 'deck') continue
    if (position.enabled === false) continue

    const card = asObject(position.card)
    if (card?.isLeader === true || card?.isBase === true) continue
    total += 1
  }
  return total
}

function cardName(card: Record<string, unknown> | null): string | null {
  return stringOrNull(card?.name) ?? stringOrNull(card?.title)
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function dateStringOrNull(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return value
}
