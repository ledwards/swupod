import { buildDeckFromState, type DeckBuilderState, type DeckEntry } from '@/lib/deckBuilder'
import { jsonParse } from '@/src/utils/json'
import { PtpPlayError, type PtpPlaySeat } from './playState'
import type { RuntimeLaunchPlan } from './runtimeLaunch'

export interface ForcetekiLaunchPlayer {
  seat: PtpPlaySeat
  userId: string
  username: string | null
  poolShareId: string
  setCode: string
  poolType: string
  poolName: string | null
  deckBuilderState: unknown
  launchToken: string
}

export interface ForcetekiLaunchSeatResult {
  seat: PtpPlaySeat
  launchUrl: string
  runtimeUserId: string | null
}

export interface ForcetekiLaunchResult {
  runtimeGameId: string
  lobbyId: string
  lobbyUrl: string | null
  spectateUrl: string | null
  seats: ForcetekiLaunchSeatResult[]
}

interface SwuDbDecklist {
  metadata: {
    name: string
    author: string
  }
  leader: DeckEntry
  secondleader: null
  base: DeckEntry
  deck: DeckEntry[]
  sideboard: DeckEntry[]
}

interface ForcetekiLaunchResponse {
  success?: boolean
  runtimeGameId?: unknown
  lobbyId?: unknown
  lobbyUrl?: unknown
  spectateUrl?: unknown
  seats?: unknown
}

interface ForcetekiLaunchResponseSeat {
  seat?: unknown
  launchUrl?: unknown
  userId?: unknown
}

export async function launchForcetekiMatch(params: {
  matchId: string
  runtimeGameId: string
  launchPlan: RuntimeLaunchPlan
  players: [ForcetekiLaunchPlayer, ForcetekiLaunchPlayer]
}): Promise<ForcetekiLaunchResult> {
  if (!params.launchPlan.launchUrl || !params.launchPlan.runtimeBaseUrl) {
    throw new PtpPlayError(503, 'runtime_unavailable', 'Forceteki runtime launch is not configured')
  }

  const launchKey = process.env.FORCETEKI_LAUNCH_KEY?.trim()
  if (!launchKey) {
    throw new PtpPlayError(503, 'runtime_launch_key_missing', 'FORCETEKI_LAUNCH_KEY is required')
  }

  const payload = {
    matchId: params.matchId,
    runtimeGameId: params.runtimeGameId,
    lobbyName: `PTP Limited ${params.matchId.slice(0, 8)}`,
    clientBaseUrl: params.launchPlan.runtimeBaseUrl,
    format: 'limited',
    cardPool: 'unlimited',
    gamesToWinMode: 'bestOfOne',
    seats: params.players.map(player => ({
      seat: player.seat,
      userId: player.userId,
      username: player.username ?? player.seat,
      launchToken: player.launchToken,
      deck: buildForcetekiDeck(player),
    })),
  }

  let response: Response
  try {
    response = await fetch(params.launchPlan.launchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${launchKey}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    throw new PtpPlayError(
      502,
      'runtime_launch_failed',
      `Forceteki launch request failed: ${error instanceof Error ? error.message : 'unknown error'}`
    )
  }

  const body = await response.json().catch(() => null) as ForcetekiLaunchResponse | null
  if (!response.ok || body?.success !== true) {
    const message = body && typeof (body as { message?: unknown }).message === 'string'
      ? (body as { message: string }).message
      : `Forceteki launch failed with HTTP ${response.status}`
    throw new PtpPlayError(502, 'runtime_launch_failed', message)
  }

  return parseForcetekiLaunchResponse(body, params.runtimeGameId)
}

function buildForcetekiDeck(player: ForcetekiLaunchPlayer): SwuDbDecklist {
  const state = jsonParse<DeckBuilderState>(player.deckBuilderState as DeckBuilderState | string | null, {})
  const deckData = buildDeckFromState(state ?? {}, player.setCode)
  if (!deckData.leader || !deckData.base) {
    throw new PtpPlayError(400, 'deck_not_ready', `${player.seat} deck is missing a leader or base`)
  }

  return {
    metadata: {
      name: `[PTP] ${deckName(player, state ?? {})}`.slice(0, 80),
      author: player.username ?? 'Protect the Pod',
    },
    leader: deckData.leader,
    secondleader: null,
    base: deckData.base,
    deck: deckData.deck,
    sideboard: deckData.sideboard,
  }
}

function deckName(player: ForcetekiLaunchPlayer, state: DeckBuilderState): string {
  if (state.poolName) return state.poolName
  if (player.poolName) return player.poolName
  return `${player.setCode} ${player.poolType === 'draft' ? 'Draft' : 'Sealed'}`
}

function parseForcetekiLaunchResponse(
  body: ForcetekiLaunchResponse,
  fallbackRuntimeGameId: string
): ForcetekiLaunchResult {
  const rawSeats = Array.isArray(body.seats) ? body.seats as ForcetekiLaunchResponseSeat[] : []
  const seats = rawSeats.map((seat): ForcetekiLaunchSeatResult => {
    const normalizedSeat = seat.seat === 'player1' || seat.seat === 'player2' ? seat.seat : null
    if (!normalizedSeat || typeof seat.launchUrl !== 'string' || seat.launchUrl.length === 0) {
      throw new PtpPlayError(502, 'runtime_launch_invalid_response', 'Forceteki launch response has invalid seat data')
    }

    return {
      seat: normalizedSeat,
      launchUrl: seat.launchUrl,
      runtimeUserId: typeof seat.userId === 'string' && seat.userId.length > 0 ? seat.userId : null,
    }
  })

  if (seats.length !== 2) {
    throw new PtpPlayError(502, 'runtime_launch_invalid_response', 'Forceteki launch response did not include two seats')
  }

  return {
    runtimeGameId: typeof body.runtimeGameId === 'string' && body.runtimeGameId.length > 0
      ? body.runtimeGameId
      : fallbackRuntimeGameId,
    lobbyId: typeof body.lobbyId === 'string' && body.lobbyId.length > 0 ? body.lobbyId : '',
    lobbyUrl: typeof body.lobbyUrl === 'string' && body.lobbyUrl.length > 0 ? body.lobbyUrl : null,
    spectateUrl: typeof body.spectateUrl === 'string' && body.spectateUrl.length > 0 ? body.spectateUrl : null,
    seats,
  }
}
