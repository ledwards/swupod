import { NextRequest, NextResponse } from 'next/server'
import { queryRow, queryRows } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { jsonParse } from '@/src/utils/json'
import {
  DraftLogPick,
  DraftPack,
  DraftedCard,
  DraftedLeader,
  PlayerData,
  reconstructDraftLog,
} from '@/src/utils/draftLogReconstruction'

type RouteContext = {
  params: Promise<{ shareId: string }>
}

type SessionLike = {
  id?: string | null
} | null

type PodRow = {
  id: string
  share_id: string
  name?: string | null
  status: string
  set_code?: string | null
  set_name?: string | null
  max_players?: number | null
  current_players?: number | null
  host_id?: string | null
  is_log_public?: boolean | null
  all_packs?: unknown
  completed_at?: string | null
}

type PlayerRow = {
  user_id?: string | null
  seat_number: number
  username?: string | null
  avatar_url?: string | null
  drafted_cards?: unknown
  drafted_leaders?: unknown
  is_bot?: boolean | null
  is_log_public?: boolean | null
  deck_builder_state?: unknown
}

type ChosenBase = {
  name: string
  aspects: unknown[]
  imageUrl: string | null
  backImageUrl: string | null
}

type SlideshowPlayer = PlayerData & {
  userId: string | null
  username: string
  avatarUrl: string | null
  isBot: boolean
  isLogPublic: boolean
  activeLeaderName: string | null
  chosenBase: ChosenBase | null
}

type SlideshowSeatBase = {
  seatNumber: number
  username: string
  avatarUrl: string | null
  isBot: boolean
  activeLeaderName: string | null
  chosenBase: ChosenBase | null
  locked: boolean
}

type SlideshowSeat = SlideshowSeatBase & {
  picks?: DraftLogPick[]
}

type SlideshowPayload = {
  draft: {
    shareId: string
    name: string | null
    setCode: string | null
    setName: string | null
    status: string
    maxPlayers: number | null
    currentPlayers: number
    isLogPublic: boolean
    completedAt: string | null
  }
  viewerSeat: number | null
  slideCount: number
  cardsPerPack: number
  seats: SlideshowSeat[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function arrayOrEmpty<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeAllPacks(value: unknown): DraftPack[][] {
  const parsed = jsonParse(value, [])
  return arrayOrEmpty(parsed).map(seatPacks =>
    arrayOrEmpty(seatPacks).map(pack => {
      const rawCards = isRecord(pack) ? pack['cards'] : []
      return {
        cards: arrayOrEmpty<Record<string, unknown>>(rawCards)
          .filter(isRecord)
          .filter(card => typeof card['instanceId'] === 'string')
          .map(card => ({ ...card, instanceId: card['instanceId'] as string })),
      }
    })
  )
}

function ensurePackSlots(allPacks: DraftPack[][], totalSeats: number): DraftPack[][] {
  return Array.from({ length: totalSeats }, (_, seatIndex) => {
    const seatPacks = allPacks[seatIndex] || []
    return [0, 1, 2].map(packIndex => {
      const pack = seatPacks[packIndex]
      return pack ? { cards: pack.cards || [] } : { cards: [] }
    })
  })
}

function normalizeDraftedCards(value: unknown): DraftedCard[] {
  return arrayOrEmpty<Record<string, unknown>>(jsonParse(value, []))
    .filter(isRecord)
    .filter(card =>
      typeof card['instanceId'] === 'string' &&
      typeof card['packNumber'] === 'number' &&
      typeof card['pickInPack'] === 'number'
    )
    .map(card => ({
      ...card,
      instanceId: card['instanceId'] as string,
      packNumber: card['packNumber'] as number,
      pickInPack: card['pickInPack'] as number,
      pickNumber: typeof card['pickNumber'] === 'number' ? card['pickNumber'] : 0,
    }))
}

function normalizeDraftedLeaders(value: unknown): DraftedLeader[] {
  return arrayOrEmpty<Record<string, unknown>>(jsonParse(value, []))
    .filter(isRecord)
    .filter(leader =>
      typeof leader['instanceId'] === 'string' &&
      typeof leader['leaderRound'] === 'number'
    )
    .map(leader => ({
      ...leader,
      instanceId: leader['instanceId'] as string,
      leaderRound: leader['leaderRound'] as number,
    }))
}

function extractDeckBuilderHighlights(value: unknown): {
  activeLeaderName: string | null
  chosenBase: ChosenBase | null
} {
  const deckState = jsonParse(value, {})
  if (!isRecord(deckState) || !isRecord(deckState['cardPositions'])) {
    return { activeLeaderName: null, chosenBase: null }
  }

  const cardPositions = deckState['cardPositions']
  const activeLeaderKey = typeof deckState['activeLeader'] === 'string' ? deckState['activeLeader'] : null
  const activeBaseKey = typeof deckState['activeBase'] === 'string' ? deckState['activeBase'] : null

  let activeLeaderName: string | null = null
  if (activeLeaderKey) {
    const leaderPosition = cardPositions[activeLeaderKey]
    const leaderCard = isRecord(leaderPosition) && isRecord(leaderPosition['card'])
      ? leaderPosition['card']
      : null
    activeLeaderName = typeof leaderCard?.['name'] === 'string' ? leaderCard['name'] : null
  }

  let chosenBase: ChosenBase | null = null
  if (activeBaseKey) {
    const basePosition = cardPositions[activeBaseKey]
    const baseCard = isRecord(basePosition) && isRecord(basePosition['card'])
      ? basePosition['card']
      : null
    if (baseCard) {
      chosenBase = {
        name: typeof baseCard['name'] === 'string' ? baseCard['name'] : '',
        aspects: arrayOrEmpty(baseCard['aspects']),
        imageUrl: typeof baseCard['imageUrl'] === 'string' ? baseCard['imageUrl'] : null,
        backImageUrl: typeof baseCard['backImageUrl'] === 'string' ? baseCard['backImageUrl'] : null,
      }
    }
  }

  return { activeLeaderName, chosenBase }
}

function buildPlayers(playerRows: PlayerRow[]): SlideshowPlayer[] {
  return playerRows
    .filter(row => typeof row.seat_number === 'number')
    .sort((a, b) => a.seat_number - b.seat_number)
    .map(row => {
      const isBot = row.is_bot === true
      const { activeLeaderName, chosenBase } = extractDeckBuilderHighlights(row.deck_builder_state)

      return {
        seatNumber: row.seat_number,
        userId: row.user_id || null,
        username: row.username || (isBot ? `Bot (Seat ${row.seat_number})` : `Player ${row.seat_number}`),
        avatarUrl: row.avatar_url || null,
        isBot,
        isLogPublic: row.is_log_public === true,
        draftedCards: normalizeDraftedCards(row.drafted_cards),
        draftedLeaders: normalizeDraftedLeaders(row.drafted_leaders),
        activeLeaderName,
        chosenBase,
      }
    })
}

function getCardsPerPack(allPacks: DraftPack[][]): number {
  return allPacks[0]?.[0]?.cards?.length || 14
}

function seatIdentity(player: SlideshowPlayer): SlideshowSeatBase {
  return {
    seatNumber: player.seatNumber,
    username: player.username,
    avatarUrl: player.avatarUrl,
    isBot: player.isBot,
    activeLeaderName: player.activeLeaderName,
    chosenBase: player.chosenBase,
    locked: false,
  }
}

function reconstructSeatPicks({
  targetSeat,
  allPacks,
  players,
}: {
  targetSeat: number
  allPacks: DraftPack[][]
  players: SlideshowPlayer[]
}): DraftLogPick[] {
  try {
    return reconstructDraftLog({
      targetSeat,
      totalSeats: players.length,
      allPacks,
      players,
    })
  } catch (error) {
    console.error('[DraftSlideshow] Failed to reconstruct picks:', error)
    return []
  }
}

function buildSlideshowPayload({
  pod,
  playerRows,
  session,
}: {
  pod: PodRow
  playerRows: PlayerRow[]
  session: SessionLike
}): SlideshowPayload {
  const players = buildPlayers(playerRows || [])
  const allPacks = ensurePackSlots(normalizeAllPacks(pod.all_packs), players.length)
  const viewerSeat = session?.id
    ? players.find(player => player.userId === session.id)?.seatNumber || null
    : null
  const isHost = Boolean(session?.id && session.id === pod.host_id)
  const isParticipant = viewerSeat !== null
  const unlockAllSeats = pod.is_log_public === true || isHost || isParticipant

  let referencePicks: DraftLogPick[] | null = null
  const seats = players.map(player => {
    const unlocked = unlockAllSeats || player.isLogPublic || player.isBot
    const identity = seatIdentity(player)

    if (!unlocked) {
      return { ...identity, locked: true }
    }

    const picks = reconstructSeatPicks({
      targetSeat: player.seatNumber,
      allPacks,
      players,
    })
    referencePicks ||= picks
    return { ...identity, picks }
  })

  if (!referencePicks && players[0]) {
    referencePicks = reconstructSeatPicks({
      targetSeat: players[0].seatNumber,
      allPacks,
      players,
    })
  }

  return {
    draft: {
      shareId: pod.share_id,
      name: pod.name || null,
      setCode: pod.set_code || null,
      setName: pod.set_name || null,
      status: pod.status,
      maxPlayers: numberOrNull(pod.max_players),
      currentPlayers: numberOrNull(pod.current_players) || players.length,
      isLogPublic: pod.is_log_public === true,
      completedAt: pod.completed_at || null,
    },
    viewerSeat,
    slideCount: referencePicks?.length || 0,
    cardsPerPack: getCardsPerPack(allPacks),
    seats,
  }
}

export const _testSeams = {
  queryRow,
  queryRows,
  getSession,
  buildSlideshowPayload,
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = _testSeams.getSession(request)

    const pod = await _testSeams.queryRow(
      `SELECT p.id, p.share_id, p.name, p.status, p.set_code, p.set_name,
              p.max_players, p.current_players, p.host_id, p.is_log_public,
              p.all_packs, p.completed_at
       FROM pods p
       WHERE p.share_id = $1 AND p.pod_type = 'draft'`,
      [shareId]
    ) as PodRow | null

    if (!pod) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    if (pod.status !== 'complete') {
      return NextResponse.json({ error: 'Draft is not complete yet' }, { status: 400 })
    }

    const playerRows = await _testSeams.queryRows(
      `SELECT DISTINCT ON (pp.seat_number)
              pp.user_id,
              pp.seat_number,
              pp.drafted_cards,
              pp.drafted_leaders,
              pp.is_bot,
              pp.is_log_public,
              u.username,
              u.avatar_url,
              cp.deck_builder_state
       FROM pod_players pp
       LEFT JOIN users u ON pp.user_id = u.id
       LEFT JOIN card_pools cp ON cp.pod_id = pp.pod_id AND cp.user_id = pp.user_id
       WHERE pp.pod_id = $1
       ORDER BY pp.seat_number, cp.created_at DESC NULLS LAST`,
      [pod.id]
    ) as PlayerRow[]

    if (!playerRows || playerRows.length === 0) {
      return NextResponse.json({ error: 'No players found for this draft' }, { status: 404 })
    }

    return NextResponse.json(buildSlideshowPayload({ pod, playerRows, session }))
  } catch (error) {
    console.error('[DraftSlideshow] API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
