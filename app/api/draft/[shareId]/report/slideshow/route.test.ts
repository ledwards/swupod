/**
 * Tests for GET /api/draft/:shareId/report/slideshow (plan U1).
 *
 * Strategy follows the project convention seen in
 * app/api/stats/me/summary/route.test.ts and app/api/draft/[shareId]/pod/route.test.ts:
 *   - The load-bearing, DB-free logic of the route is exported as pure
 *     functions from route.ts and exercised directly against the unit's
 *     spec with crafted inputs — NO database, NO mocking.
 *   - `computeViewableSeats(...)` is the entitlement/gating gate (mirrors
 *     the /log route's viewableSeats model, with the deliberate
 *     participant-sees-all divergence from the plan).
 *   - `buildSlideshowResponse(...)` assembles the response: it loops the
 *     seated players, calls the real (pure) reconstructDraftLog for
 *     UNLOCKED seats, omits the `picks` key for LOCKED seats, and computes
 *     cardsPerPack / slideCount. Because reconstructDraftLog is pure we run
 *     it for real here against internally-consistent seeded packs, so the
 *     visibleCards / slide-alignment / leaders-first / under-filled
 *     assertions are genuine end-to-end through the reconstruction.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  computeViewableSeats,
  buildSlideshowResponse,
  type SlideshowPlayer,
  type SlideshowPod,
  type SlideshowResponse,
  type SlideshowSeat,
} from './route'

// ---------------------------------------------------------------------------
// Fixture builders — an internally consistent completed draft.
// ---------------------------------------------------------------------------

// A small, deterministic pack of N cards for a given seat index + pack number.
// instanceIds are namespaced by seat + pack + slot so they're unique and the
// reconstruction has something concrete to surface as visibleCards.
function makePack(seatIdx: number, packNum: number, count: number) {
  const cards = []
  for (let slot = 0; slot < count; slot++) {
    cards.push({
      instanceId: `s${seatIdx}-p${packNum}-c${slot}`,
      cardId: `card-${packNum}-${slot}`,
      name: `Card ${packNum}.${slot}`,
    })
  }
  return { cards }
}

// allPacks[playerIndex][packIndex] = { cards: [...] }
// Every seat gets 3 physical packs of `cardsPerPack` cards.
function makeAllPacks(totalSeats: number, cardsPerPack: number) {
  const allPacks = []
  for (let seatIdx = 0; seatIdx < totalSeats; seatIdx++) {
    allPacks.push([
      makePack(seatIdx, 1, cardsPerPack),
      makePack(seatIdx, 2, cardsPerPack),
      makePack(seatIdx, 3, cardsPerPack),
    ])
  }
  return allPacks
}

// Each player picks their OWN pack's slot-0 card at every pick. That keeps the
// fixture self-consistent (every card a player "drafted" really exists in a
// pack they could have seen) and gives each pick a known pickedInstanceId.
function makeDraftedCards(seatIdx: number, cardsPerPack: number) {
  const drafted = []
  for (let packNum = 1; packNum <= 3; packNum++) {
    for (let pick = 1; pick <= cardsPerPack; pick++) {
      drafted.push({
        instanceId: `s${seatIdx}-p${packNum}-c0`,
        packNumber: packNum,
        pickInPack: pick,
        pickNumber: (packNum - 1) * cardsPerPack + pick,
      })
    }
  }
  return drafted
}

function makeDraftedLeaders(seatIdx: number, leaderRounds: number) {
  const leaders = []
  for (let round = 1; round <= leaderRounds; round++) {
    leaders.push({
      instanceId: `s${seatIdx}-leader-r${round}`,
      leaderRound: round,
      name: `Leader ${seatIdx}.${round}`,
    })
  }
  return leaders
}

// A pod_players-shaped row (snake_case, as it comes back from SQL).
function makePlayerRow(seatNumber: number, overrides: Partial<SlideshowPlayer> = {}): SlideshowPlayer {
  const seatIdx = seatNumber - 1
  return {
    seat_number: seatNumber,
    user_id: `user-${seatNumber}`,
    username: `Player ${seatNumber}`,
    avatar_url: `/avatar-${seatNumber}.png`,
    is_bot: false,
    is_log_public: false,
    drafted_cards: makeDraftedCards(seatIdx, DEFAULT_CARDS_PER_PACK),
    drafted_leaders: makeDraftedLeaders(seatIdx, 3),
    active_leader_name: `Leader ${seatIdx}.1`,
    chosen_base: { name: `Base ${seatNumber}`, aspects: [], imageUrl: null, backImageUrl: null },
    ...overrides,
  }
}

const DEFAULT_CARDS_PER_PACK = 14

// A full, standard 4-seat completed draft.
function makeFullDraft() {
  const cardsPerPack = DEFAULT_CARDS_PER_PACK
  const totalSeats = 4
  const players: SlideshowPlayer[] = [
    makePlayerRow(1),
    makePlayerRow(2),
    makePlayerRow(3),
    makePlayerRow(4, { is_bot: true, username: 'Bot (Seat 4)' }),
  ]
  const pod: SlideshowPod = {
    id: 'pod-1',
    share_id: 'share-abc',
    set_code: 'SOR',
    set_name: 'Spark of Rebellion',
    name: 'Test Draft',
    status: 'complete',
    host_id: 'user-1',
    is_log_public: false,
  }
  const allPacks = makeAllPacks(totalSeats, cardsPerPack)
  return { pod, players, allPacks, cardsPerPack, totalSeats }
}

// Narrowing accessors — assert.ok's `asserts` predicate removes `undefined`,
// so the spec bodies stay clean while picks stays honestly optional on the type.
function seatOf(body: SlideshowResponse, seatNumber: number): SlideshowSeat {
  const seat = body.seats.find(s => s.seatNumber === seatNumber)
  assert.ok(seat, `seat ${seatNumber} should be present`)
  return seat
}

function picksOf(seat: SlideshowSeat) {
  assert.ok(seat.picks, `seat ${seat.seatNumber} should carry picks`)
  return seat.picks
}

// ---------------------------------------------------------------------------
// computeViewableSeats — entitlement gating
// ---------------------------------------------------------------------------

describe('computeViewableSeats (entitlement gating)', () => {
  const { pod, players } = makeFullDraft()
  // seat 4 is a bot; mark seat 3 public, leave seats 1 & 2 private.
  const mixedPlayers = players.map(p =>
    p.seat_number === 3 ? { ...p, is_log_public: true } : p,
  )

  it('host sees ALL seats', () => {
    const session = { id: pod.host_id as string } // user-1 is host
    const viewable = computeViewableSeats(pod, mixedPlayers, session)
    assert.deepStrictEqual([...viewable].sort((a, b) => a - b), [1, 2, 3, 4])
  })

  it('participant (non-host) sees ALL seats (participant-sees-all policy)', () => {
    const session = { id: 'user-2' } // seat 2, not the host
    const viewable = computeViewableSeats(pod, mixedPlayers, session)
    assert.deepStrictEqual([...viewable].sort((a, b) => a - b), [1, 2, 3, 4])
  })

  it('pod.is_log_public makes ALL seats viewable for anyone', () => {
    const publicPod = { ...pod, is_log_public: true }
    const stranger = { id: 'user-999' }
    const viewable = computeViewableSeats(publicPod, players, stranger)
    assert.deepStrictEqual([...viewable].sort((a, b) => a - b), [1, 2, 3, 4])
  })

  it('non-participant sees only public seats + bot seats', () => {
    const stranger = { id: 'user-999' }
    const viewable = computeViewableSeats(pod, mixedPlayers, stranger)
    // seat 3 public, seat 4 bot — seats 1 & 2 are private and hidden.
    assert.deepStrictEqual([...viewable].sort((a, b) => a - b), [3, 4])
  })

  it('unauthenticated (session == null) is treated as a non-participant, not a 401', () => {
    const viewable = computeViewableSeats(pod, mixedPlayers, null)
    assert.deepStrictEqual([...viewable].sort((a, b) => a - b), [3, 4])
  })

  it('bot seats are always viewable, even to a stranger on a fully private draft', () => {
    const allPrivate = players // seats 1-3 private, seat 4 bot
    const stranger = { id: 'user-999' }
    const viewable = computeViewableSeats(pod, allPrivate, stranger)
    assert.deepStrictEqual([...viewable], [4])
  })

  it('fully private draft viewed by a stranger with no bots → no viewable seats', () => {
    const noBots = players.map(p => ({ ...p, is_bot: false }))
    const stranger = { id: 'user-999' }
    const viewable = computeViewableSeats(pod, noBots, stranger)
    assert.deepStrictEqual([...viewable], [])
  })
})

// ---------------------------------------------------------------------------
// buildSlideshowResponse — payload assembly + reconstruction
// ---------------------------------------------------------------------------

describe('buildSlideshowResponse (happy path — participant sees all)', () => {
  const { pod, players, allPacks, cardsPerPack, totalSeats } = makeFullDraft()
  const session = { id: 'user-2' } // participant → all seats unlocked
  const viewable = new Set([1, 2, 3, 4])
  const body = buildSlideshowResponse({ pod, players, allPacks, viewableSeats: viewable, session })

  it('returns one seat entry per seated player', () => {
    assert.strictEqual(body.seats.length, players.length)
    assert.strictEqual(body.seats.length, 4)
  })

  it('viewerSeat reflects the requesting participant', () => {
    assert.strictEqual(body.viewerSeat, 2)
  })

  it('cardsPerPack === allPacks[0][0].cards.length', () => {
    assert.strictEqual(body.cardsPerPack, allPacks[0][0].cards.length)
    assert.strictEqual(body.cardsPerPack, cardsPerPack)
  })

  it('slideCount === min(3, players.length) + 3 * cardsPerPack', () => {
    const expected = Math.min(3, totalSeats) + 3 * cardsPerPack
    assert.strictEqual(body.slideCount, expected)
  })

  it('every unlocked seat has picks.length === slideCount', () => {
    for (const seat of body.seats) {
      assert.strictEqual(seat.locked, false, `seat ${seat.seatNumber} should be unlocked`)
      const picks = picksOf(seat)
      assert.ok(Array.isArray(picks), `seat ${seat.seatNumber} should carry a picks array`)
      assert.strictEqual(picks.length, body.slideCount)
    }
  })

  it('each pick carries visibleCards and a pickedInstanceId field', () => {
    const seat = body.seats[0]
    for (const pick of picksOf(seat)) {
      assert.ok(Array.isArray(pick.visibleCards), 'visibleCards is an array')
      assert.ok('pickedInstanceId' in pick, 'pick exposes pickedInstanceId')
    }
  })

  it('a real card pick (pack 1, pick 1) has non-empty visibleCards and a matching pickedInstanceId', () => {
    const seat = body.seats[0]
    const firstCardPick = picksOf(seat).find(p => p.type === 'card' && p.packNumber === 1 && p.pickInPack === 1)
    assert.ok(firstCardPick, 'found pack1/pick1')
    assert.ok(firstCardPick.visibleCards.length > 0, 'pack1/pick1 shows a full pack of cards')
    assert.strictEqual(firstCardPick.visibleCards.length, cardsPerPack)
    // The seeded picker always took their own slot-0 card.
    assert.strictEqual(firstCardPick.pickedInstanceId, 's0-p1-c0')
  })

  it('seat identity fields (username, avatarUrl, isBot, activeLeaderName, chosenBase) are present', () => {
    const seat = seatOf(body, 1)
    assert.strictEqual(seat.username, 'Player 1')
    assert.strictEqual(seat.avatarUrl, '/avatar-1.png')
    assert.strictEqual(seat.isBot, false)
    assert.strictEqual(seat.activeLeaderName, 'Leader 0.1')
    assert.ok(seat.chosenBase && seat.chosenBase.name === 'Base 1')
  })

  it('draft meta is echoed (shareId, setCode, setName, status)', () => {
    assert.strictEqual(body.draft.shareId, pod.share_id)
    assert.strictEqual(body.draft.setCode, pod.set_code)
    assert.strictEqual(body.draft.setName, pod.set_name)
    assert.strictEqual(body.draft.status, pod.status)
  })
})

describe('buildSlideshowResponse (slide alignment across seats)', () => {
  const { pod, players, allPacks } = makeFullDraft()
  const viewable = new Set([1, 2, 3, 4])
  const body = buildSlideshowResponse({
    pod, players, allPacks, viewableSeats: viewable, session: { id: 'user-1' },
  })

  it('picks[i].packNumber and picks[i].pickInPack are equal across two different seats at every i', () => {
    const picksA = picksOf(seatOf(body, 1))
    const picksB = picksOf(seatOf(body, 3))
    assert.strictEqual(picksA.length, picksB.length)
    for (let i = 0; i < picksA.length; i++) {
      assert.strictEqual(picksA[i].packNumber, picksB[i].packNumber, `packNumber mismatch at i=${i}`)
      assert.strictEqual(picksA[i].pickInPack, picksB[i].pickInPack, `pickInPack mismatch at i=${i}`)
    }
  })
})

describe('buildSlideshowResponse (leaders are the first slides)', () => {
  const { pod, players, allPacks, totalSeats } = makeFullDraft()
  const viewable = new Set([1, 2, 3, 4])
  const body = buildSlideshowResponse({
    pod, players, allPacks, viewableSeats: viewable, session: { id: 'user-1' },
  })

  it('the first min(3, players.length) picks are type "leader" with packNumber 0', () => {
    const leaderRounds = Math.min(3, totalSeats)
    const picks = picksOf(body.seats[0])
    for (let i = 0; i < leaderRounds; i++) {
      assert.strictEqual(picks[i].type, 'leader', `pick ${i} should be a leader`)
      assert.strictEqual(picks[i].packNumber, 0, `leader pick ${i} should have packNumber 0`)
    }
    // The slide right after the leaders is a real card pick.
    assert.strictEqual(picks[leaderRounds].type, 'card')
    assert.strictEqual(picks[leaderRounds].packNumber, 1)
  })
})

describe('buildSlideshowResponse (gating — private seat locked for non-participant)', () => {
  const { pod, players, allPacks } = makeFullDraft()
  // seat 3 public, seat 4 bot; seats 1 & 2 private.
  const mixedPlayers = players.map(p =>
    p.seat_number === 3 ? { ...p, is_log_public: true } : p,
  )

  // Non-participant: only seats 3 (public) + 4 (bot) are viewable.
  const strangerViewable = new Set([3, 4])
  const body = buildSlideshowResponse({
    pod, players: mixedPlayers, allPacks, viewableSeats: strangerViewable, session: { id: 'user-999' },
  })

  it('still returns a seat entry for every seated player (including locked ones)', () => {
    assert.strictEqual(body.seats.length, mixedPlayers.length)
  })

  it('a private seat is locked, retains identity, and OMITS the picks key entirely', () => {
    const lockedSeat = seatOf(body, 1)
    assert.strictEqual(lockedSeat.locked, true)
    // identity present
    assert.strictEqual(lockedSeat.username, 'Player 1')
    assert.strictEqual(lockedSeat.avatarUrl, '/avatar-1.png')
    assert.strictEqual(lockedSeat.isBot, false)
    assert.strictEqual(lockedSeat.activeLeaderName, 'Leader 0.1')
    assert.ok(lockedSeat.chosenBase && lockedSeat.chosenBase.name === 'Base 1')
    // picks must NOT be serialized at all for a locked seat
    assert.ok(!('picks' in lockedSeat), 'locked seat must not carry a picks key')
  })

  it('the public seat is unlocked and carries picks', () => {
    const publicSeat = seatOf(body, 3)
    assert.strictEqual(publicSeat.locked, false)
    const picks = picksOf(publicSeat)
    assert.ok(Array.isArray(picks))
    assert.strictEqual(picks.length, body.slideCount)
  })

  it('the bot seat is unlocked even for a non-participant', () => {
    const botSeat = seatOf(body, 4)
    assert.strictEqual(botSeat.isBot, true)
    assert.strictEqual(botSeat.locked, false)
    assert.ok(Array.isArray(picksOf(botSeat)))
  })
})

describe('buildSlideshowResponse (gating — same private seat unlocked for participant/host)', () => {
  const { pod, players, allPacks } = makeFullDraft()
  const mixedPlayers = players.map(p =>
    p.seat_number === 3 ? { ...p, is_log_public: true } : p,
  )
  // Participant / host sees all seats unlocked.
  const allViewable = new Set([1, 2, 3, 4])
  const body = buildSlideshowResponse({
    pod, players: mixedPlayers, allPacks, viewableSeats: allViewable, session: { id: 'user-1' },
  })

  it('seat 1 (private) is unlocked with picks when the viewer is entitled', () => {
    const seat = seatOf(body, 1)
    assert.strictEqual(seat.locked, false)
    const picks = picksOf(seat)
    assert.ok(Array.isArray(picks))
    assert.strictEqual(picks.length, body.slideCount)
  })
})

describe('buildSlideshowResponse (under-filled draft — totalSeats = players.length, NOT max_players)', () => {
  // A draft with capacity for 8 but only 4 seated. If totalSeats were
  // mistakenly max_players (8), reconstruction would index allPacks out of
  // bounds and emit EMPTY visibleCards for real picks. We assert non-empty.
  const cardsPerPack = DEFAULT_CARDS_PER_PACK
  const totalSeats = 4
  const players = [makePlayerRow(1), makePlayerRow(2), makePlayerRow(3), makePlayerRow(4)]
  const pod: SlideshowPod = {
    id: 'pod-underfilled',
    share_id: 'share-underfilled',
    set_code: 'SOR',
    set_name: 'Spark of Rebellion',
    name: 'Underfilled Draft',
    status: 'complete',
    host_id: 'user-1',
    is_log_public: false,
    max_players: 8, // deliberately larger than players.length
  }
  const allPacks = makeAllPacks(totalSeats, cardsPerPack)
  const viewable = new Set([1, 2, 3, 4])
  const body = buildSlideshowResponse({ pod, players, allPacks, viewableSeats: viewable, session: { id: 'user-1' } })

  it('seats.length === players.length (4), not max_players (8)', () => {
    assert.strictEqual(body.seats.length, 4)
  })

  it('a real card pick has NON-EMPTY visibleCards (proves totalSeats = seated count)', () => {
    const seat = body.seats[0]
    const cardPick = picksOf(seat).find(p => p.type === 'card' && p.packNumber === 1 && p.pickInPack === 1)
    assert.ok(cardPick, 'found pack1/pick1')
    assert.ok(cardPick.visibleCards.length > 0, 'visibleCards must not be empty for an under-filled draft')
    assert.strictEqual(cardPick.visibleCards.length, cardsPerPack)
  })
})

describe('buildSlideshowResponse (edge — missing/short all_packs degrades, never throws)', () => {
  const { pod, players } = makeFullDraft()
  const viewable = new Set([1, 2, 3, 4])

  it('empty all_packs → seats still returned, card picks have empty visibleCards, no throw', () => {
    let body: SlideshowResponse | undefined
    assert.doesNotThrow(() => {
      body = buildSlideshowResponse({ pod, players, allPacks: [], viewableSeats: viewable, session: { id: 'user-1' } })
    })
    assert.ok(body, 'body assigned')
    assert.strictEqual(body.seats.length, players.length)
    // cardsPerPack falls back to 14 when packs are missing.
    assert.strictEqual(body.cardsPerPack, 14)
    const seat = body.seats[0]
    const cardPick = picksOf(seat).find(p => p.type === 'card')
    assert.ok(cardPick, 'card picks still generated')
    assert.deepStrictEqual(cardPick.visibleCards, [], 'visibleCards empty when packs missing')
  })

  it('null all_packs (guarded to []) → does not throw', () => {
    assert.doesNotThrow(() => {
      buildSlideshowResponse({ pod, players, allPacks: null, viewableSeats: viewable, session: { id: 'user-1' } })
    })
  })
})

describe('buildSlideshowResponse (cardsPerPack derivation)', () => {
  it('derives cardsPerPack from the actual pack size (e.g. 10), not a hardcoded 14', () => {
    const cardsPerPack = 10
    const totalSeats = 4
    const players: SlideshowPlayer[] = [
      { ...makePlayerRow(1), drafted_cards: makeDraftedCards(0, cardsPerPack) },
      { ...makePlayerRow(2), drafted_cards: makeDraftedCards(1, cardsPerPack) },
      { ...makePlayerRow(3), drafted_cards: makeDraftedCards(2, cardsPerPack) },
      { ...makePlayerRow(4), drafted_cards: makeDraftedCards(3, cardsPerPack) },
    ]
    const pod: SlideshowPod = {
      id: 'pod-10', share_id: 'share-10', set_code: 'SOR', set_name: 'X',
      status: 'complete', host_id: 'user-1', is_log_public: false,
    }
    const allPacks = makeAllPacks(totalSeats, cardsPerPack)
    const body = buildSlideshowResponse({
      pod, players, allPacks, viewableSeats: new Set([1, 2, 3, 4]), session: { id: 'user-1' },
    })
    assert.strictEqual(body.cardsPerPack, 10)
    assert.strictEqual(body.slideCount, Math.min(3, totalSeats) + 3 * 10)
  })
})

console.log('\n🧪 Running slideshow report API tests...\n')
