// Safety net for the leaderPoolRows payload optimization.
//
// The gameplay route used to `SELECT deck_builder_state` (the ENTIRE pool
// deck-builder blob — every card position with full card objects) for up to
// 300 pools, just to read each pool's leader + base for the Leaders widget.
// The optimization trims that in SQL to only { activeLeader, activeBase, and
// the cardPositions entries for those two ids }.
//
// This is only safe because `buildLeaderBreakdown` reads NOTHING but the
// leader and base — never the deck cards, counts, or any other position. These
// tests lock that property in: for representative pools, buildLeaderBreakdown
// must produce BYTE-IDENTICAL output whether given the full blob or the trim.
//
// `trimForLeader` below is the executable spec for what the SQL CASE expression
// must produce. If you change the SQL, change this to match (and vice versa).
//
// Pure functions only — no DB. Imports just buildLeaderBreakdown so it is
// unaffected by the unrelated red-spec import in route.test.ts.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildLeaderBreakdown } from './route'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROUTE_SRC = readFileSync(join(__dirname, 'route.ts'), 'utf8')

/**
 * Executable spec mirroring the SQL CASE on the leaderPoolRows query:
 *   - only a well-formed object with an object `cardPositions` is trimmed;
 *     anything else passes through untouched (the JS parseDeckBuilderState
 *     handles legacy string/null shapes exactly as before).
 *   - keeps activeLeader/activeBase and ONLY their two position entries.
 *   - an empty keep-set becomes {} (matches COALESCE(..., '{}')).
 */
function trimForLeader(state: any): any {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state
  const cp = state.cardPositions
  if (!cp || typeof cp !== 'object' || Array.isArray(cp)) return state
  const keep: Record<string, unknown> = {}
  for (const id of [state.activeLeader, state.activeBase]) {
    if (id != null && Object.prototype.hasOwnProperty.call(cp, id)) keep[id] = cp[id]
  }
  return {
    activeLeader: state.activeLeader ?? null,
    activeBase: state.activeBase ?? null,
    cardPositions: keep,
  }
}

/** Apply the trim to each row's deck_builder_state, leaving record cols alone. */
function trimRows(rows: any[]): any[] {
  return rows.map((r) => ({ ...r, deck_builder_state: trimForLeader(r.deck_builder_state) }))
}

/** A full, realistic deck_builder_state: leader + base + many deck cards. */
function fullPool(opts: {
  leaderName: string
  leaderImageUrl?: string | null
  baseAspect?: string | null
  wins: number
  losses: number
  draws?: number
}) {
  const positions: Record<string, unknown> = {
    L: { section: 'leaders', enabled: true, visible: true, card: { name: opts.leaderName, imageUrl: opts.leaderImageUrl ?? '/l.png', backImageUrl: '/l_unit.png', isLeader: true, hp: 30, cost: null } },
  }
  if (opts.baseAspect) {
    positions.B = { section: 'bases', card: { name: 'Some Base', aspects: [opts.baseAspect], isBase: true, hp: 30 } }
  }
  // Lots of deck cards with full card objects — exactly the bulk the trim drops.
  for (let i = 0; i < 40; i++) {
    positions[`c${i}`] = {
      section: 'deck',
      enabled: true,
      visible: true,
      card: { name: `Card ${i}`, imageUrl: `/c${i}.png`, artUrl: `/c${i}-art.png`, aspects: ['Command'], cost: i % 7, text: 'x'.repeat(80) },
    }
  }
  return {
    deck_builder_state: {
      poolName: 'My Pool',
      activeLeader: 'L',
      activeBase: opts.baseAspect ? 'B' : undefined,
      cardPositions: positions,
    },
    wins: opts.wins,
    losses: opts.losses,
    draws: opts.draws ?? 0,
  }
}

describe('leaderPoolRows payload trim — buildLeaderBreakdown is invariant to the trim', () => {
  const assertInvariant = (rows: any[]) => {
    assert.deepEqual(
      buildLeaderBreakdown(trimRows(rows)),
      buildLeaderBreakdown(rows),
      'trimmed deck_builder_state must yield identical leader breakdown to the full blob',
    )
  }

  it('single pool with leader + base + 40 deck cards', () => {
    assertInvariant([fullPool({ leaderName: 'Han Solo', leaderImageUrl: '/han.png', baseAspect: 'Vigilance', wins: 3, losses: 1 })])
  })

  it('leader with no base picked', () => {
    assertInvariant([fullPool({ leaderName: 'Boba Fett', baseAspect: null, wins: 2, losses: 2 })])
  })

  it('multiple pools aggregated by leader (Han x2, Boba x1)', () => {
    assertInvariant([
      fullPool({ leaderName: 'Han Solo', leaderImageUrl: '/han.png', baseAspect: 'Vigilance', wins: 3, losses: 1 }),
      fullPool({ leaderName: 'Han Solo', leaderImageUrl: '/han.png', baseAspect: 'Cunning', wins: 1, losses: 0 }),
      fullPool({ leaderName: 'Boba Fett', leaderImageUrl: '/boba.png', baseAspect: 'Aggression', wins: 1, losses: 3 }),
    ])
  })

  it('byBase aspect split survives the trim', () => {
    const rows = [
      fullPool({ leaderName: 'Cassian', baseAspect: 'Vigilance', wins: 3, losses: 1 }),
      fullPool({ leaderName: 'Cassian', baseAspect: 'Cunning', wins: 1, losses: 3 }),
    ]
    assertInvariant(rows)
    // And the trimmed path actually carries the base aspect through (not just "equal because both empty").
    const trimmed = buildLeaderBreakdown(trimRows(rows))
    const cassian = trimmed.find((r) => r.leaderName === 'Cassian')!
    assert.equal(cassian.byBase.find((b) => b.aspect === 'Vigilance')!.winRate, 75)
    assert.equal(cassian.byBase.find((b) => b.aspect === 'Cunning')!.winRate, 25)
  })

  it('pool with games but no leader is skipped, with or without the trim', () => {
    const rows = [{ deck_builder_state: { cardPositions: { x: { section: 'deck', card: { name: 'Orphan' } } } }, wins: 2, losses: 1 }]
    assertInvariant(rows)
    assert.equal(buildLeaderBreakdown(trimRows(rows)).length, 0)
  })

  it('activeLeader pointing at a missing position → skipped, identical either way', () => {
    assertInvariant([{ deck_builder_state: { activeLeader: 'GONE', cardPositions: {} }, wins: 1, losses: 1 }])
  })

  it('non-object / null / legacy-string states pass through unchanged', () => {
    assertInvariant([{ deck_builder_state: null, wins: 1, losses: 1 }])
    assertInvariant([{ deck_builder_state: JSON.stringify({ activeLeader: 'L', cardPositions: { L: { card: { name: 'Leia' } } } }), wins: 2, losses: 0 }])
  })

  it('the trimmed path still produces the correct leader record (not silently empty)', () => {
    const trimmed = buildLeaderBreakdown(trimRows([
      fullPool({ leaderName: 'Han Solo', leaderImageUrl: '/han.png', baseAspect: 'Vigilance', wins: 4, losses: 1 }),
    ]))
    assert.equal(trimmed.length, 1)
    assert.equal(trimmed[0].leaderName, 'Han Solo')
    assert.equal(trimmed[0].leaderImageUrl, '/han.png')
    assert.equal(trimmed[0].matches, 5)
    assert.equal(trimmed[0].winRate, 80) // 4/5
  })
})

describe('leaderPoolRows query selects the trimmed shape (regression tripwire)', () => {
  // Isolate the leaderPoolRows query text so these matches can't accidentally
  // pass on a different query that happens to mention deck_builder_state.
  const leaderQuery = ROUTE_SRC.slice(
    ROUTE_SRC.indexOf('aggregated by leader in JS'),
    ROUTE_SRC.indexOf('LIMIT 300') + 'LIMIT 300'.length,
  )

  it('trims via jsonb_build_object over activeLeader/activeBase only', () => {
    assert.match(leaderQuery, /jsonb_build_object/)
    assert.match(leaderQuery, /'activeLeader'/)
    assert.match(leaderQuery, /'activeBase'/)
    assert.match(leaderQuery, /jsonb_object_agg/)
  })

  it('guards on object shape and falls back otherwise', () => {
    assert.match(leaderQuery, /jsonb_typeof\(deck_builder_state\) = 'object'/)
  })

  it('no longer SELECTs the full deck_builder_state blob for the leader query', () => {
    assert.doesNotMatch(leaderQuery, /SELECT deck_builder_state, wins/)
  })
})
