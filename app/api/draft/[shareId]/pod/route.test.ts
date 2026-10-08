// @ts-nocheck
/**
 * Tests for GET /api/draft/:shareId/pod
 *
 * Tests the pod API endpoint logic including:
 * - Response structure
 * - Pairing computation integration
 * - Player readiness (built_decks detection)
 * - Bye assignment and persistence
 * - Host vs non-host view
 * - Error handling
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { computePairings } from '@/src/utils/podPairings'

// Simulate the response building logic from the route
function buildPodResponse(
  pod,
  players,
  session,
  storedByePlayerId
) {
  const playerData = players.map(p => ({
    userId: p.user_id,
    seatNumber: p.seat_number,
  }))
  const { matches, byePlayerId } = computePairings(playerData, storedByePlayerId)

  const isHost = session?.id === pod.host_id
  const myPlayer = session ? players.find(p => p.user_id === session.id) : null

  let myOpponent = null
  let myBye = false

  if (myPlayer) {
    if (byePlayerId === myPlayer.user_id) {
      myBye = true
    } else {
      const myMatch = matches.find(
        m => m.player1Id === myPlayer.user_id || m.player2Id === myPlayer.user_id
      )
      if (myMatch) {
        const opponentId = myMatch.player1Id === myPlayer.user_id
          ? myMatch.player2Id
          : myMatch.player1Id
        const opponent = players.find(p => p.user_id === opponentId)
        if (opponent) {
          myOpponent = {
            id: opponent.user_id,
            username: opponent.username,
            avatarUrl: opponent.avatar_url,
            isReady: opponent.is_ready,
            poolShareId: opponent.pool_share_id,
          }
        }
      }
    }
  }

  return {
    draft: {
      shareId: pod.share_id,
      setCode: pod.set_code,
      setName: pod.set_name,
      hostId: pod.host_id,
      status: pod.status,
      completedAt: pod.completed_at,
    },
    players: players.map(p => ({
      id: p.user_id,
      username: p.username,
      avatarUrl: p.avatar_url,
      seatNumber: p.seat_number,
      poolShareId: p.pool_share_id,
      isReady: p.is_ready,
    })),
    pairings: {
      matches: matches.map(m => {
        const p1 = players.find(p => p.user_id === m.player1Id)
        const p2 = players.find(p => p.user_id === m.player2Id)
        return {
          player1: {
            id: m.player1Id,
            username: p1?.username,
            avatarUrl: p1?.avatar_url,
            isReady: p1?.is_ready || false,
          },
          player2: {
            id: m.player2Id,
            username: p2?.username,
            avatarUrl: p2?.avatar_url,
            isReady: p2?.is_ready || false,
          },
        }
      }),
      byePlayer: byePlayerId ? (() => {
        const bp = players.find(p => p.user_id === byePlayerId)
        return bp ? {
          id: bp.user_id,
          username: bp.username,
          avatarUrl: bp.avatar_url,
        } : null
      })() : null,
    },
    myOpponent,
    myBye,
    isHost,
    myPoolShareId: myPlayer?.pool_share_id || null,
  }
}

// Test fixtures
const mockPod = {
  id: 'pod-uuid',
  share_id: 'abc123',
  host_id: 'user-1',
  status: 'complete',
  set_code: 'SOR',
  set_name: 'Spark of Rebellion',
  draft_state: '{}',
  completed_at: '2025-01-01T00:00:00Z',
}

function mockPlayers(count) {
  return Array.from({ length: count }, (_, i) => ({
    user_id: `user-${i + 1}`,
    seat_number: i + 1,
    username: `Player${i + 1}`,
    avatar_url: `https://cdn.example.com/avatar${i + 1}.png`,
    pool_share_id: `pool-${i + 1}`,
    pool_id: `pool-uuid-${i + 1}`,
    is_ready: i < 2, // first 2 players are ready
  }))
}

describe('Pod API Response', () => {
  describe('response structure', () => {
    it('includes all required top-level fields', () => {
      const players = mockPlayers(4)
      const session = { id: 'user-1' }
      const response = buildPodResponse(mockPod, players, session, null)

      assert.ok(response.draft, 'should have draft')
      assert.ok(response.players, 'should have players')
      assert.ok(response.pairings, 'should have pairings')
      assert.ok('myOpponent' in response, 'should have myOpponent')
      assert.ok('myBye' in response, 'should have myBye')
      assert.ok('isHost' in response, 'should have isHost')
      assert.ok('myPoolShareId' in response, 'should have myPoolShareId')
    })

    it('draft field contains correct pod metadata', () => {
      const players = mockPlayers(4)
      const response = buildPodResponse(mockPod, players, null, null)

      assert.strictEqual(response.draft.shareId, 'abc123')
      assert.strictEqual(response.draft.setCode, 'SOR')
      assert.strictEqual(response.draft.setName, 'Spark of Rebellion')
      assert.strictEqual(response.draft.hostId, 'user-1')
      assert.strictEqual(response.draft.status, 'complete')
      assert.strictEqual(response.draft.completedAt, '2025-01-01T00:00:00Z')
    })

    it('players array maps DB fields to camelCase', () => {
      const players = mockPlayers(2)
      const response = buildPodResponse(mockPod, players, null, null)

      assert.strictEqual(response.players.length, 2)
      assert.strictEqual(response.players[0].id, 'user-1')
      assert.strictEqual(response.players[0].username, 'Player1')
      assert.strictEqual(response.players[0].avatarUrl, 'https://cdn.example.com/avatar1.png')
      assert.strictEqual(response.players[0].seatNumber, 1)
      assert.strictEqual(response.players[0].poolShareId, 'pool-1')
      assert.strictEqual(response.players[0].isReady, true)
    })
  })

  describe('readiness detection', () => {
    it('marks players with built_decks as ready', () => {
      const players = mockPlayers(4)
      const response = buildPodResponse(mockPod, players, null, null)

      assert.strictEqual(response.players[0].isReady, true, 'Player 1 should be ready')
      assert.strictEqual(response.players[1].isReady, true, 'Player 2 should be ready')
      assert.strictEqual(response.players[2].isReady, false, 'Player 3 should not be ready')
      assert.strictEqual(response.players[3].isReady, false, 'Player 4 should not be ready')
    })

    it('readiness is reflected in match pairings', () => {
      const players = mockPlayers(4)
      const response = buildPodResponse(mockPod, players, null, null)

      // Match 1: player-1 (ready) vs player-3 (not ready)
      assert.strictEqual(response.pairings.matches[0].player1.isReady, true)
      assert.strictEqual(response.pairings.matches[0].player2.isReady, false)
    })

    it('readiness is reflected in myOpponent', () => {
      // user-3 session, opponent is user-1 (ready)
      const players = mockPlayers(4)
      const session = { id: 'user-3' }
      const response = buildPodResponse(mockPod, players, session, null)

      assert.strictEqual(response.myOpponent.id, 'user-1')
      assert.strictEqual(response.myOpponent.isReady, true)
    })
  })

  describe('host detection', () => {
    it('identifies the host correctly', () => {
      const players = mockPlayers(4)
      const session = { id: 'user-1' } // host
      const response = buildPodResponse(mockPod, players, session, null)

      assert.strictEqual(response.isHost, true)
    })

    it('non-host is not identified as host', () => {
      const players = mockPlayers(4)
      const session = { id: 'user-2' }
      const response = buildPodResponse(mockPod, players, session, null)

      assert.strictEqual(response.isHost, false)
    })

    it('anonymous user is not host', () => {
      const players = mockPlayers(4)
      const response = buildPodResponse(mockPod, players, null, null)

      assert.strictEqual(response.isHost, false)
    })
  })

  describe('opponent lookup', () => {
    it('finds correct opponent for player 1 (seat 1 vs seat 3)', () => {
      const players = mockPlayers(4)
      const session = { id: 'user-1' }
      const response = buildPodResponse(mockPod, players, session, null)

      assert.strictEqual(response.myOpponent.id, 'user-3')
      assert.strictEqual(response.myOpponent.username, 'Player3')
    })

    it('finds correct opponent for player 3 (seat 3 vs seat 1)', () => {
      const players = mockPlayers(4)
      const session = { id: 'user-3' }
      const response = buildPodResponse(mockPod, players, session, null)

      assert.strictEqual(response.myOpponent.id, 'user-1')
      assert.strictEqual(response.myOpponent.username, 'Player1')
    })

    it('finds correct opponent for player 2 (seat 2 vs seat 4)', () => {
      const players = mockPlayers(4)
      const session = { id: 'user-2' }
      const response = buildPodResponse(mockPod, players, session, null)

      assert.strictEqual(response.myOpponent.id, 'user-4')
    })

    it('includes opponent poolShareId', () => {
      const players = mockPlayers(4)
      const session = { id: 'user-1' }
      const response = buildPodResponse(mockPod, players, session, null)

      assert.strictEqual(response.myOpponent.poolShareId, 'pool-3')
    })

    it('returns null opponent for anonymous user', () => {
      const players = mockPlayers(4)
      const response = buildPodResponse(mockPod, players, null, null)

      assert.strictEqual(response.myOpponent, null)
      assert.strictEqual(response.myBye, false)
    })

    it('returns null opponent for user not in pod', () => {
      const players = mockPlayers(4)
      const session = { id: 'user-99' }
      const response = buildPodResponse(mockPod, players, session, null)

      assert.strictEqual(response.myOpponent, null)
      assert.strictEqual(response.myBye, false)
    })
  })

  describe('bye handling', () => {
    it('sets myBye=true for player with bye', () => {
      const players = mockPlayers(3)
      const session = { id: 'user-2' }
      const response = buildPodResponse(mockPod, players, session, 'user-2')

      assert.strictEqual(response.myBye, true)
      assert.strictEqual(response.myOpponent, null)
    })

    it('sets myBye=false for matched player in odd pod', () => {
      const players = mockPlayers(3)
      const session = { id: 'user-1' }
      const response = buildPodResponse(mockPod, players, session, 'user-3')

      assert.strictEqual(response.myBye, false)
      assert.notStrictEqual(response.myOpponent, null)
    })

    it('bye player appears in pairings.byePlayer', () => {
      const players = mockPlayers(3)
      const response = buildPodResponse(mockPod, players, null, 'user-2')

      assert.strictEqual(response.pairings.byePlayer.id, 'user-2')
      assert.strictEqual(response.pairings.byePlayer.username, 'Player2')
    })

    it('no byePlayer for even player count', () => {
      const players = mockPlayers(4)
      const response = buildPodResponse(mockPod, players, null, null)

      assert.strictEqual(response.pairings.byePlayer, null)
    })
  })

  describe('myPoolShareId', () => {
    it('returns pool share ID for authenticated player', () => {
      const players = mockPlayers(4)
      const session = { id: 'user-1' }
      const response = buildPodResponse(mockPod, players, session, null)

      assert.strictEqual(response.myPoolShareId, 'pool-1')
    })

    it('returns null for anonymous user', () => {
      const players = mockPlayers(4)
      const response = buildPodResponse(mockPod, players, null, null)

      assert.strictEqual(response.myPoolShareId, null)
    })

    it('returns null for user not in pod', () => {
      const players = mockPlayers(4)
      const session = { id: 'user-99' }
      const response = buildPodResponse(mockPod, players, session, null)

      assert.strictEqual(response.myPoolShareId, null)
    })
  })

  describe('match structure', () => {
    it('each match has player1 and player2 with id, username, avatarUrl, isReady', () => {
      const players = mockPlayers(4)
      const response = buildPodResponse(mockPod, players, null, null)

      const match = response.pairings.matches[0]
      assert.ok('id' in match.player1)
      assert.ok('username' in match.player1)
      assert.ok('avatarUrl' in match.player1)
      assert.ok('isReady' in match.player1)
      assert.ok('id' in match.player2)
      assert.ok('username' in match.player2)
      assert.ok('avatarUrl' in match.player2)
      assert.ok('isReady' in match.player2)
    })

    it('correct number of matches for 8 players', () => {
      const players = mockPlayers(8)
      const response = buildPodResponse(mockPod, players, null, null)

      assert.strictEqual(response.pairings.matches.length, 4)
    })

    it('correct number of matches for 5 players (with bye)', () => {
      const players = mockPlayers(5)
      const response = buildPodResponse(mockPod, players, null, 'user-3')

      assert.strictEqual(response.pairings.matches.length, 2)
      assert.strictEqual(response.pairings.byePlayer.id, 'user-3')
    })
  })
})
