/**
 * Tests for draft-picks stats API query building logic.
 *
 * Verifies that the builtDeckOnly, tournamentOnly, and userId parameters
 * correctly add JOIN/WHERE clauses to filter draft picks.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'

// Extract the query-building logic for testability
// This mirrors the JOIN-building logic in route.ts

interface QueryParts {
  botJoin: string
  botFilter: string
  builtDeckJoin: string
  tournamentFilter: string
  userFilter: string
  queryParams: (string | string[])[]
}

function buildQueryParts(opts: {
  includeBots: boolean
  includeHumans: boolean
  builtDeckOnly: boolean
  tournamentOnly?: boolean
  userId?: string | null
  tournamentUserIds?: string[]
}): QueryParts {
  let botJoin = ''
  let botFilter = ''
  if (!opts.includeBots || !opts.includeHumans) {
    botJoin = `JOIN pod_players dpp ON dp.pod_id = dpp.pod_id AND dp.user_id = dpp.user_id`
    if (!opts.includeBots && opts.includeHumans) {
      botFilter = `AND (dpp.is_bot = false OR dpp.is_bot IS NULL)`
    } else if (opts.includeBots && !opts.includeHumans) {
      botFilter = `AND dpp.is_bot = true`
    }
  }

  let builtDeckJoin = ''
  if (opts.builtDeckOnly) {
    builtDeckJoin = `JOIN card_pools cp_bd ON cp_bd.pod_id = dp.pod_id AND cp_bd.user_id = dp.user_id
      JOIN built_decks bd ON bd.card_pool_id = cp_bd.id`
  }

  const queryParams: (string | string[])[] = ['SOR', '2020-01-01', '2099-12-31']

  let tournamentFilter = ''
  if (opts.tournamentOnly && opts.tournamentUserIds) {
    queryParams.push(opts.tournamentUserIds)
    tournamentFilter = `AND dp.user_id = ANY($${queryParams.length}::uuid[])`
  }

  let userFilter = ''
  if (opts.userId) {
    queryParams.push(opts.userId)
    userFilter = `AND dp.user_id = $${queryParams.length}::uuid`
  }

  return { botJoin, botFilter, builtDeckJoin, tournamentFilter, userFilter, queryParams }
}

describe('draft-picks query building', () => {
  describe('builtDeckOnly filter', () => {
    it('adds no JOIN when builtDeckOnly is false', () => {
      const parts = buildQueryParts({ includeBots: true, includeHumans: true, builtDeckOnly: false })
      assert.strictEqual(parts.builtDeckJoin, '')
    })

    it('adds card_pools and built_decks JOINs when builtDeckOnly is true', () => {
      const parts = buildQueryParts({ includeBots: true, includeHumans: true, builtDeckOnly: true })
      assert.ok(parts.builtDeckJoin.includes('JOIN card_pools'), 'should JOIN card_pools')
      assert.ok(parts.builtDeckJoin.includes('JOIN built_decks'), 'should JOIN built_decks')
      assert.ok(parts.builtDeckJoin.includes('cp_bd.pod_id = dp.pod_id'), 'should match on pod_id')
      assert.ok(parts.builtDeckJoin.includes('cp_bd.user_id = dp.user_id'), 'should match on user_id')
      assert.ok(parts.builtDeckJoin.includes('bd.card_pool_id = cp_bd.id'), 'should join built_decks via card_pool_id')
    })

    it('composes correctly with bot filter', () => {
      const parts = buildQueryParts({ includeBots: false, includeHumans: true, builtDeckOnly: true })
      assert.ok(parts.botJoin.includes('JOIN pod_players'), 'should have bot join')
      assert.ok(parts.botFilter.includes('dpp.is_bot = false'), 'should filter bots')
      assert.ok(parts.builtDeckJoin.includes('JOIN built_decks'), 'should also have built_decks join')
    })

    it('composes correctly with humans-only filter', () => {
      const parts = buildQueryParts({ includeBots: true, includeHumans: false, builtDeckOnly: true })
      assert.ok(parts.botFilter.includes('dpp.is_bot = true'), 'should filter to bots only')
      assert.ok(parts.builtDeckJoin.includes('JOIN built_decks'), 'should also have built_decks join')
    })
  })

  describe('builtDeckOnly param parsing', () => {
    // Mirrors: const builtDeckOnly = url.searchParams.get('builtDeckOnly') === 'true'
    const parse = (val: string | null) => val === 'true'

    it('defaults to false when param is absent', () => {
      assert.strictEqual(parse(null), false)
    })

    it('is true only when param is exactly "true"', () => {
      assert.strictEqual(parse('true'), true)
      assert.strictEqual(parse('false'), false)
      assert.strictEqual(parse('1'), false)
      assert.strictEqual(parse(''), false)
    })
  })

  describe('includeBots param parsing', () => {
    // Mirrors: const includeBots = url.searchParams.get('includeBots') === 'true'
    // Default is false — human-only data by default, opt-in to include bots.
    const parse = (val: string | null) => val === 'true'

    it('defaults to false when param is absent (human-only by default)', () => {
      assert.strictEqual(parse(null), false)
    })

    it('is true only when param is exactly "true"', () => {
      assert.strictEqual(parse('true'), true)
      assert.strictEqual(parse('false'), false)
      assert.strictEqual(parse('1'), false)
      assert.strictEqual(parse(''), false)
    })
  })

  describe('userId filter', () => {
    it('adds no filter when userId is null', () => {
      const parts = buildQueryParts({ includeBots: true, includeHumans: true, builtDeckOnly: false, userId: null })
      assert.strictEqual(parts.userFilter, '')
      assert.strictEqual(parts.queryParams.length, 3, 'should only have base params')
    })

    it('adds user_id WHERE clause with correct param index when userId is set', () => {
      const parts = buildQueryParts({ includeBots: true, includeHumans: true, builtDeckOnly: false, userId: 'abc-123' })
      assert.ok(parts.userFilter.includes('dp.user_id = $4::uuid'), 'should filter by user_id at $4')
      assert.strictEqual(parts.queryParams.length, 4, 'should have 4 params')
      assert.strictEqual(parts.queryParams[3], 'abc-123', 'should include userId in params')
    })

    it('userId param index accounts for tournamentOnly param', () => {
      const parts = buildQueryParts({
        includeBots: true,
        includeHumans: true,
        builtDeckOnly: false,
        tournamentOnly: true,
        tournamentUserIds: ['user-1', 'user-2'],
        userId: 'abc-123',
      })
      assert.ok(parts.tournamentFilter.includes('$4::uuid[]'), 'tournament filter at $4')
      assert.ok(parts.userFilter.includes('$5::uuid'), 'user filter at $5')
      assert.strictEqual(parts.queryParams.length, 5)
    })

    it('composes correctly with all filters', () => {
      const parts = buildQueryParts({
        includeBots: false,
        includeHumans: true,
        builtDeckOnly: true,
        tournamentOnly: true,
        tournamentUserIds: ['user-1'],
        userId: 'my-user-id',
      })
      assert.ok(parts.botJoin.includes('JOIN pod_players'), 'has bot join')
      assert.ok(parts.botFilter.includes('dpp.is_bot = false'), 'has bot filter')
      assert.ok(parts.builtDeckJoin.includes('JOIN built_decks'), 'has built deck join')
      assert.ok(parts.tournamentFilter.includes('ANY($4::uuid[])'), 'has tournament filter')
      assert.ok(parts.userFilter.includes('$5::uuid'), 'has user filter')
    })
  })

  describe('userId param parsing', () => {
    // Mirrors: const userId = url.searchParams.get('userId') || null
    const parse = (val: string | null) => val || null

    it('defaults to null when param is absent', () => {
      assert.strictEqual(parse(null), null)
    })

    it('defaults to null when param is empty string', () => {
      assert.strictEqual(parse(''), null)
    })

    it('returns the userId when present', () => {
      assert.strictEqual(parse('abc-123-def'), 'abc-123-def')
    })
  })
})
