import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { GET, _testSeams } = await import('./route.ts')

const originalSeams = {
  queryRow: _testSeams.queryRow,
  queryRows: _testSeams.queryRows,
  getSession: _testSeams.getSession,
}

afterEach(() => {
  Object.assign(_testSeams, originalSeams)
})

function makeAllPacks(playerCount = 4, cardsPerPack = 5) {
  return Array.from({ length: playerCount }, (_, playerIndex) =>
    Array.from({ length: 3 }, (_, packIndex) => ({
      cards: Array.from({ length: cardsPerPack }, (_, cardIndex) => ({
        instanceId: `seat-${playerIndex + 1}-pack-${packIndex + 1}-card-${cardIndex + 1}`,
        name: `S${playerIndex + 1} P${packIndex + 1} C${cardIndex + 1}`,
        imageUrl: `/cards/${playerIndex + 1}-${packIndex + 1}-${cardIndex + 1}.png`,
      })),
    }))
  )
}

function makeDraftedCards(seatNumber, cardsPerPack = 5) {
  const picks = []
  for (let packNumber = 1; packNumber <= 3; packNumber++) {
    for (let pickInPack = 1; pickInPack <= cardsPerPack; pickInPack++) {
      picks.push({
        instanceId: `seat-${seatNumber}-pack-${packNumber}-card-${pickInPack}`,
        packNumber,
        pickInPack,
        pickNumber: (packNumber - 1) * cardsPerPack + pickInPack,
      })
    }
  }
  return picks
}

function makeDraftedLeaders(seatNumber, playerCount = 4) {
  return Array.from({ length: Math.min(3, playerCount) }, (_, index) => ({
    instanceId: `seat-${seatNumber}-leader-${index + 1}`,
    leaderRound: index + 1,
    name: `Leader ${seatNumber}.${index + 1}`,
    imageUrl: `/leaders/${seatNumber}-${index + 1}.png`,
  }))
}

function makeDeckBuilderState(seatNumber) {
  return JSON.stringify({
    activeLeader: `leader-${seatNumber}`,
    activeBase: `base-${seatNumber}`,
    cardPositions: {
      [`leader-${seatNumber}`]: {
        card: { name: `Active Leader ${seatNumber}` },
      },
      [`base-${seatNumber}`]: {
        card: {
          name: `Base ${seatNumber}`,
          aspects: ['Command'],
          imageUrl: `/bases/${seatNumber}.png`,
          backImageUrl: `/bases/${seatNumber}-back.png`,
        },
      },
    },
  })
}

function makePod(overrides = {}) {
  return {
    id: 'pod-1',
    share_id: 'draft-1',
    name: 'Friday Draft',
    status: 'complete',
    set_code: 'SOR',
    set_name: 'Spark of Rebellion',
    max_players: 8,
    current_players: 4,
    host_id: 'host-user',
    is_log_public: false,
    all_packs: makeAllPacks(),
    completed_at: '2026-06-19T12:00:00Z',
    ...overrides,
  }
}

function makePlayerRows(overridesBySeat = {}) {
  return [1, 2, 3, 4].map(seatNumber => ({
    user_id: `user-${seatNumber}`,
    seat_number: seatNumber,
    username: `Player ${seatNumber}`,
    avatar_url: `/avatars/${seatNumber}.png`,
    drafted_cards: JSON.stringify(makeDraftedCards(seatNumber)),
    drafted_leaders: JSON.stringify(makeDraftedLeaders(seatNumber)),
    is_bot: seatNumber === 4,
    is_log_public: seatNumber === 3,
    deck_builder_state: makeDeckBuilderState(seatNumber),
    ...overridesBySeat[seatNumber],
  }))
}

function installRouteMocks({ pod = makePod(), playerRows = makePlayerRows(), session = null } = {}) {
  _testSeams.getSession = () => session
  _testSeams.queryRow = async (_sql, params) => {
    return params[0] === pod.share_id ? pod : null
  }
  _testSeams.queryRows = async () => playerRows
}

async function callRoute(shareId = 'draft-1') {
  const response = await GET(
    new Request(`http://localhost/api/draft/${shareId}/report/slideshow`),
    { params: Promise.resolve({ shareId }) }
  )
  return { response, body: await response.json() }
}

function seatByNumber(body, seatNumber) {
  return body.seats.find(seat => seat.seatNumber === seatNumber)
}

describe('GET /api/draft/[shareId]/report/slideshow', () => {
  it('returns all aligned, leader-first seat logs for a participant', async () => {
    installRouteMocks({ session: { id: 'user-2' } })

    const { response, body } = await callRoute()

    assert.equal(response.status, 200)
    assert.equal(body.viewerSeat, 2)
    assert.equal(body.cardsPerPack, 5)
    assert.equal(body.slideCount, 18)
    assert.equal(body.seats.length, 4)

    for (const seat of body.seats) {
      assert.equal(seat.locked, false)
      assert.equal(seat.picks.length, body.slideCount)
      assert.equal(seat.picks[0].type, 'leader')
      assert.equal(seat.picks[0].packNumber, 0)
      assert.equal(seat.picks[2].type, 'leader')
      assert.equal(seat.picks[3].type, 'card')
      assert.ok(Array.isArray(seat.picks[3].visibleCards))
      assert.equal(typeof seat.picks[3].pickedInstanceId, 'string')
    }

    const seatOne = seatByNumber(body, 1)
    const seatTwo = seatByNumber(body, 2)
    for (let i = 0; i < body.slideCount; i++) {
      assert.equal(seatOne.picks[i].packNumber, seatTwo.picks[i].packNumber)
      assert.equal(seatOne.picks[i].pickInPack, seatTwo.picks[i].pickInPack)
    }

    assert.equal(seatTwo.activeLeaderName, 'Active Leader 2')
    assert.deepEqual(seatTwo.chosenBase, {
      name: 'Base 2',
      aspects: ['Command'],
      imageUrl: '/bases/2.png',
      backImageUrl: '/bases/2-back.png',
    })
  })

  it('locks private human seats for non-participants while public and bot seats stay unlocked', async () => {
    installRouteMocks({ session: { id: 'stranger-user' } })

    const { response, body } = await callRoute()

    assert.equal(response.status, 200)
    assert.equal(body.viewerSeat, null)

    const privateSeat = seatByNumber(body, 1)
    assert.equal(privateSeat.locked, true)
    assert.equal(privateSeat.username, 'Player 1')
    assert.equal(privateSeat.avatarUrl, '/avatars/1.png')
    assert.equal(Object.hasOwn(privateSeat, 'picks'), false)

    const publicSeat = seatByNumber(body, 3)
    assert.equal(publicSeat.locked, false)
    assert.equal(publicSeat.picks.length, body.slideCount)

    const botSeat = seatByNumber(body, 4)
    assert.equal(botSeat.isBot, true)
    assert.equal(botSeat.locked, false)
    assert.equal(botSeat.picks.length, body.slideCount)
  })

  it('treats unauthenticated viewers as non-participants, not 401s', async () => {
    installRouteMocks({ session: null })

    const { response, body } = await callRoute()

    assert.equal(response.status, 200)
    assert.equal(seatByNumber(body, 1).locked, true)
    assert.equal(Object.hasOwn(seatByNumber(body, 1), 'picks'), false)
    assert.equal(seatByNumber(body, 3).locked, false)
    assert.equal(seatByNumber(body, 4).locked, false)
  })

  it('unlocks every seat for the host and for pod-public drafts', async () => {
    installRouteMocks({ session: { id: 'host-user' } })
    const hostResult = await callRoute()
    assert.equal(hostResult.response.status, 200)
    assert.deepEqual(hostResult.body.seats.map(seat => seat.locked), [false, false, false, false])

    installRouteMocks({ pod: makePod({ is_log_public: true }), session: null })
    const publicResult = await callRoute()
    assert.equal(publicResult.response.status, 200)
    assert.deepEqual(publicResult.body.seats.map(seat => seat.locked), [false, false, false, false])
  })

  it('uses seated player count, not max_players, when reconstructing under-filled drafts', async () => {
    installRouteMocks({ session: { id: 'user-1' } })

    const { body } = await callRoute()
    const seatOne = seatByNumber(body, 1)
    const fifthPick = seatOne.picks.find(pick => pick.packNumber === 1 && pick.pickInPack === 5)

    assert.ok(fifthPick, 'expected pack 1 pick 5 to exist')
    assert.ok(
      fifthPick.visibleCards.length > 0,
      'pick 5 in a four-player draft with max_players=8 should still resolve a real source pack'
    )
  })

  it('falls back safely for malformed JSON and missing pack arrays', async () => {
    installRouteMocks({
      pod: makePod({ all_packs: 'not json' }),
      playerRows: makePlayerRows({
        1: { drafted_cards: 'not json', drafted_leaders: 'not json', deck_builder_state: 'not json' },
        2: { drafted_cards: null, drafted_leaders: null },
      }),
      session: { id: 'user-1' },
    })

    const { response, body } = await callRoute()

    assert.equal(response.status, 200)
    assert.equal(body.cardsPerPack, 14)
    assert.equal(body.slideCount, 45)
    const cardPick = seatByNumber(body, 1).picks.find(pick => pick.type === 'card')
    assert.deepEqual(cardPick.visibleCards, [])
    assert.equal(seatByNumber(body, 1).activeLeaderName, null)
    assert.equal(seatByNumber(body, 1).chosenBase, null)
  })

  it('returns 404 for an unknown shareId', async () => {
    installRouteMocks()

    const { response, body } = await callRoute('missing-draft')

    assert.equal(response.status, 404)
    assert.equal(body.error, 'Draft not found')
  })
})
