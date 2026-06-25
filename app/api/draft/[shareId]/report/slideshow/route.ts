// app/api/draft/[shareId]/report/slideshow/route.ts
/**
 * GET /api/draft/:shareId/report/slideshow
 *
 * Serves every VIEWABLE seat's reconstructed picks for one completed draft, in
 * a single gated request, so the Slideshow Mode client never fans out fetches
 * or filters privacy in the browser.
 *
 * Modeled on app/api/draft/[shareId]/log/route.ts (the all-seats reconstruction
 * precedent): it loads the pod + every pod_player, parses JSON with jsonParse,
 * computes per-seat entitlement (viewableSeats), and calls reconstructDraftLog
 * with totalSeats = players.length (the SEATED count, never pod.max_players —
 * passing max_players on an under-filled draft indexes allPacks out of bounds
 * and emits empty visibleCards for real picks).
 *
 * activeLeaderName / chosenBase are sourced the way the per-pool report route
 * (app/api/draft/[shareId]/report/[poolShareId]/route.ts) sources them: from
 * each pool's deck_builder_state.
 *
 * Entitlement (mirrors /log's viewableSeats, with one DELIBERATE divergence):
 *   - pod.is_log_public OR isHost OR myPlayer (participant) → ALL seats unlocked.
 *     NOTE: letting any *participant* see all seats is more permissive than the
 *     Draft Log, which restricts a non-host participant to own + bots + public.
 *     This is the team-review intent (see the plan's Key Technical Decisions).
 *     To restore per-seat privacy among participants, change the participant
 *     branch in computeViewableSeats to own + bots + public — a one-line edit.
 *   - otherwise (non-participant OR unauthenticated session === null) → only
 *     seats where is_log_public, PLUS bot seats (bots carry no privacy interest).
 *     An unauthenticated viewer of a public draft is NOT 401'd.
 *
 * Locked seats return identity + locked:true and OMIT the `picks` key entirely
 * (server-side — picks for a locked seat are never serialized).
 */
import { NextRequest, NextResponse } from 'next/server'
import { queryRow, queryRows } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { jsonParse } from '@/src/utils/json'
import { reconstructDraftLog, type DraftLogPick } from '@/src/utils/draftLogReconstruction'

type RouteContext = { params: Promise<{ shareId: string }> }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A drafted base resolved from a pool's deck_builder_state. */
export interface ChosenBase {
  name: string
  aspects: string[]
  imageUrl: string | null
  backImageUrl: string | null
}

/** Pod fields this route reads (the SELECT pins these). */
export interface SlideshowPod {
  id: string
  share_id: string
  set_code: string
  set_name?: string | null
  name?: string | null
  status: string
  host_id: string | null
  is_log_public: boolean
  // Live-mode access + timer fields (selected only when needed):
  is_public?: boolean
  observer_public?: boolean
  timer_enabled?: boolean
  timer_seconds?: number
  pick_timeout_seconds?: number | null
  pick_started_at?: string | null
  paused?: boolean
  paused_at?: string | null
  paused_duration_seconds?: number
  competitive?: boolean
  draft_state?: any
  max_players?: number
  // Raw JSON column; parsed by the handler, not the pure logic.
  all_packs?: any
}

/** A seated player, normalized to the shape the pure logic consumes. */
export interface SlideshowPlayer {
  seat_number: number
  user_id: string | null
  username: string
  avatar_url: string | null
  is_bot: boolean
  is_log_public: boolean
  // Draft picks are untyped JSON from the DB (node-pg returns jsonb parsed).
  drafted_cards: any[]
  drafted_leaders: any[]
  active_leader_name: string | null
  chosen_base: ChosenBase | null
}

/** One seat in the response. Locked seats OMIT `picks` entirely (no key). */
export interface SlideshowSeat {
  seatNumber: number
  username: string
  avatarUrl: string | null
  isBot: boolean
  activeLeaderName: string | null
  chosenBase: ChosenBase | null
  locked: boolean
  picks?: DraftLogPick[]
}

/** Live timer/phase block — present only on live (?live=1) responses. Mirrors
 *  the fields TimerPanel consumes; the socket `state` event supersedes it. */
export interface SlideshowTimer {
  status: string
  paused: boolean
  pausedAt: string | null
  pausedDurationSeconds: number
  pickStartedAt: string | null
  timerEnabled: boolean
  timerSeconds: number
  pickTimeoutSeconds: number
  competitive: boolean
  draftState: any
}

export interface SlideshowResponse {
  draft: {
    shareId: string
    name: string | null
    setCode: string
    setName: string | null
    status: string
  }
  viewerSeat: number | null
  slideCount: number
  cardsPerPack: number
  seats: SlideshowSeat[]
  // Live mode only:
  live?: boolean
  timer?: SlideshowTimer
  phase?: { phase: string | null }
}

// ---------------------------------------------------------------------------
// Pure logic (exported for unit tests — no DB, no I/O).
// ---------------------------------------------------------------------------

/**
 * Compute the set of seat numbers the requesting session may view.
 *
 * @param pod      Pod row (needs `host_id`, `is_log_public`).
 * @param players  Seated players (need `seat_number`, `user_id`, `is_bot`, `is_log_public`).
 * @param session  Auth session or null.
 * @returns Set of viewable seat numbers.
 */
export function computeViewableSeats(
  pod: SlideshowPod,
  players: SlideshowPlayer[],
  session: { id: string } | null,
): Set<number> {
  const rows = players || []
  const isHost = !!session && session.id === pod.host_id
  const myPlayer = session ? rows.find(p => p.user_id === session.id) : null

  // Participant / host / pod-public → all seats unlocked (participant-sees-all).
  if (pod.is_log_public || isHost || myPlayer) {
    return new Set(rows.map(p => p.seat_number))
  }

  // Non-participant or unauthenticated → only public seats + bot seats.
  return new Set(
    rows
      .filter(p => p.is_log_public || p.is_bot)
      .map(p => p.seat_number),
  )
}

/**
 * Gate a LIVE (in-progress) slideshow request — Privileged Observer only.
 *
 *   - mode 'observer' → public, no-login kiosk link. Allowed only when the host
 *     has explicitly enabled it (`observer_public`). No auth required.
 *
 * When allowed, the caller unlocks ALL seats: enabling the observer link is an
 * explicit host opt-in to exposing the in-progress table.
 */
export function computeLiveAccess(
  pod: { observer_public?: boolean },
  mode: string | null,
): { allowed: boolean; reason?: string } {
  if (mode === 'observer') {
    return pod.observer_public
      ? { allowed: true }
      : { allowed: false, reason: 'The Privileged Observer link is not enabled for this draft' }
  }
  return { allowed: false, reason: 'Unknown live mode' }
}

/**
 * Assemble the slideshow response body from already-loaded, already-parsed data.
 *
 * Pure: reconstructDraftLog is itself pure, so this runs end-to-end in tests
 * against seeded packs. Locked seats omit `picks` entirely.
 */
export function buildSlideshowResponse({
  pod,
  players,
  allPacks,
  viewableSeats,
  session,
}: {
  pod: SlideshowPod
  players: SlideshowPlayer[]
  allPacks: unknown
  viewableSeats: Set<number>
  session: { id: string } | null
}): SlideshowResponse {
  const rows = players || []
  const packs: any[] = Array.isArray(allPacks) ? allPacks : []
  const totalSeats = rows.length
  const cardsPerPack: number = packs[0]?.[0]?.cards?.length || 14

  // Player data for the reconstructor (1-indexed seats, parsed picks).
  const playerData = rows.map(p => ({
    seatNumber: p.seat_number,
    username: p.username,
    draftedCards: p.drafted_cards || [],
    draftedLeaders: p.drafted_leaders || [],
  }))

  let slideCount = 0

  const seats: SlideshowSeat[] = rows.map(p => {
    const identity = {
      seatNumber: p.seat_number,
      username: p.username,
      avatarUrl: p.avatar_url ?? null,
      isBot: !!p.is_bot,
      activeLeaderName: p.active_leader_name ?? null,
      chosenBase: p.chosen_base ?? null,
    }

    // Locked seat: identity only, NO picks key serialized.
    if (!viewableSeats.has(p.seat_number)) {
      return { ...identity, locked: true }
    }

    const picks = reconstructDraftLog({
      targetSeat: p.seat_number,
      totalSeats, // SEATED count — never pod.max_players
      allPacks: packs,
      players: playerData,
    })

    if (picks.length > slideCount) {
      slideCount = picks.length
    }

    return { ...identity, locked: false, picks }
  })

  // slideCount derives from a reconstructed seat's picks.length. If no seat is
  // viewable (all locked), fall back to the structural count so the client can
  // still size its nav: min(3, seats) leader rounds + 3 packs.
  if (slideCount === 0) {
    slideCount = Math.min(3, totalSeats) + 3 * cardsPerPack
  }

  const viewerSeat = session
    ? (rows.find(p => p.user_id === session.id)?.seat_number ?? null)
    : null

  return {
    draft: {
      shareId: pod.share_id,
      name: pod.name ?? null,
      setCode: pod.set_code,
      setName: pod.set_name ?? null,
      status: pod.status,
    },
    viewerSeat,
    slideCount,
    cardsPerPack,
    seats,
  }
}

// ---------------------------------------------------------------------------
// Route handler (DB I/O — wires the pure logic above to Postgres).
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = getSession(request)

    // Load the draft pod (host + visibility + packs). The SELECT pins the fields.
    const pod = (await queryRow(
      `SELECT p.id, p.share_id, p.set_code, p.set_name, p.name, p.status,
              p.host_id, p.is_log_public, p.is_public, p.observer_public,
              p.timer_enabled, p.timer_seconds, p.pick_timeout_seconds,
              p.pick_started_at, p.paused, p.paused_at, p.paused_duration_seconds,
              p.competitive, p.draft_state, p.all_packs
       FROM pods p
       WHERE p.share_id = $1 AND p.pod_type = 'draft'`,
      [shareId],
    )) as unknown as SlideshowPod | null
    if (!pod) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    // Live (in-progress) Privileged Observer — gate before doing work.
    const url = new URL(request.url)
    const live = url.searchParams.get('live') === '1'
    const mode = url.searchParams.get('mode') // 'observer' | null
    if (live) {
      const access = computeLiveAccess(pod, mode)
      if (!access.allowed) {
        return NextResponse.json({ error: access.reason || 'Forbidden' }, { status: 403 })
      }
    }

    // Load all players with pick data + visibility (one row per seat).
    const playerRows = (await queryRows(
      `SELECT DISTINCT ON (pp.seat_number)
              pp.seat_number,
              pp.user_id,
              pp.drafted_cards,
              pp.drafted_leaders,
              pp.is_bot,
              pp.is_log_public,
              u.username,
              u.avatar_url
       FROM pod_players pp
       LEFT JOIN users u ON pp.user_id = u.id
       WHERE pp.pod_id = $1
       ORDER BY pp.seat_number`,
      [pod.id],
    )) as unknown as Array<{
      seat_number: number
      user_id: string | null
      drafted_cards: any
      drafted_leaders: any
      is_bot: boolean
      is_log_public: boolean
      username: string | null
      avatar_url: string | null
    }>

    if (!playerRows || playerRows.length === 0) {
      return NextResponse.json({ error: 'No players found for this draft' }, { status: 404 })
    }

    // Resolve activeLeaderName / chosenBase from each pool's deck_builder_state
    // (same source as the per-pool report route).
    const poolsResult = (await queryRows(
      `SELECT cp.user_id, cp.deck_builder_state
       FROM card_pools cp
       WHERE cp.pod_id = $1`,
      [pod.id],
    )) as unknown as Array<{ user_id: string; deck_builder_state: any }>

    const activeLeaderByUser = new Map<string, string>()
    const chosenBaseByUser = new Map<string, ChosenBase>()
    for (const row of poolsResult || []) {
      const dbs: any = jsonParse(row.deck_builder_state, null)
      if (dbs?.cardPositions) {
        if (dbs.activeLeader) {
          const leaderPos = dbs.cardPositions[dbs.activeLeader]
          if (leaderPos?.card?.name) {
            activeLeaderByUser.set(row.user_id, leaderPos.card.name)
          }
        }
        if (dbs.activeBase) {
          const basePos = dbs.cardPositions[dbs.activeBase]
          if (basePos?.card) {
            chosenBaseByUser.set(row.user_id, {
              name: basePos.card.name || '',
              aspects: basePos.card.aspects || [],
              imageUrl: basePos.card.imageUrl || null,
              backImageUrl: basePos.card.backImageUrl || null,
            })
          }
        }
      }
    }

    // Normalize player rows: parse JSON picks, synthesize bot names, attach
    // resolved leader/base — the shape buildSlideshowResponse consumes.
    const players: SlideshowPlayer[] = playerRows.map(p => ({
      seat_number: p.seat_number,
      user_id: p.user_id,
      username: p.username || (p.is_bot ? `Bot (Seat ${p.seat_number})` : `Player ${p.seat_number}`),
      avatar_url: p.avatar_url ?? null,
      is_bot: !!p.is_bot,
      is_log_public: !!p.is_log_public,
      drafted_cards: jsonParse<any[]>(p.drafted_cards, []) || [],
      drafted_leaders: jsonParse<any[]>(p.drafted_leaders, []) || [],
      active_leader_name: (p.user_id != null && activeLeaderByUser.get(p.user_id)) || null,
      chosen_base: (p.user_id != null && chosenBaseByUser.get(p.user_id)) || null,
    }))

    const allPacks = jsonParse<any[]>(pod.all_packs, [])
    // Live (Privileged Observer) access is an explicit host opt-in (an enabled
    // observer link), so every seat is unlocked while watching. Outside live
    // mode the normal per-seat privacy model applies.
    const viewableSeats = live
      ? new Set<number>(players.map(p => p.seat_number))
      : computeViewableSeats(pod, players, session)

    const body = buildSlideshowResponse({ pod, players, allPacks, viewableSeats, session })

    if (live) {
      // Slides to expose: every COMPLETED pick PLUS the one in progress (the
      // pack / set of leaders the table is currently on) — but never beyond.
      // `completed` is the min made-picks across seats (a pick round is "done"
      // only once every seat has taken it); +1 surfaces the current pack so the
      // observer always shows what's being drafted, capped to the full length.
      const totalSlides = body.slideCount
      const completed = players.length
        ? Math.min(...players.map(p => (p.drafted_leaders?.length || 0) + (p.drafted_cards?.length || 0)))
        : 0
      const frontier = Math.min(completed + 1, totalSlides)
      body.slideCount = frontier
      for (const seat of body.seats) {
        if (Array.isArray(seat.picks)) seat.picks = seat.picks.slice(0, frontier)
      }

      const draftState = jsonParse(pod.draft_state, {}) as any
      body.live = true
      body.timer = {
        status: pod.status,
        paused: pod.paused === true,
        pausedAt: pod.paused_at ?? null,
        pausedDurationSeconds: pod.paused_duration_seconds || 0,
        pickStartedAt: pod.pick_started_at ?? null,
        timerEnabled: pod.timer_enabled !== false,
        timerSeconds: pod.timer_seconds || 0,
        pickTimeoutSeconds: pod.pick_timeout_seconds || 60,
        competitive: pod.competitive === true,
        draftState,
      }
      body.phase = { phase: draftState?.phase ?? null }
    }

    return NextResponse.json(body)
  } catch (error) {
    console.error('Failed to build slideshow report:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
