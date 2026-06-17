// @ts-nocheck
/**
 * Tests for GET /api/stats/me/luck (plan U6).
 *
 * Strategy mirrors U5's summary test:
 *
 *   - Pure helper functions (parseScopeParam, parseSetCodeParam,
 *     aggregateObserved, buildRarityPanel, buildAspectPanel, buildStreaks,
 *     buildEmptyResponse) are exercised directly. They contain the
 *     load-bearing logic that doesn't need a live DB.
 *
 *   - Handler-level auth/rate-limit edges (401, 429, 400) are exercised
 *     against the real GET handler with crafted Requests.
 *
 *   - SQL-shape assertions read the route source and verify the
 *     plan-required clauses are present (load-bearing per Plan U6
 *     "do not silently drop these constraints"):
 *       - explicit pp.user_id = $1 on the JOIN (not just WHERE)
 *       - pp.is_bot = false on the draft side
 *       - standard + chaos branches for the seat predicate
 *       - half-open date filter
 *       - Cache-Control: private, max-age=60 + Vary: Cookie
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createToken } from '@/lib/auth'
import { _store as rateLimitStore, MAX_REQUESTS } from '@/lib/rateLimit'
import {
  parseDateParam,
  parseScopeParam,
  parseSetCodeParam,
  aggregateObserved,
  buildRarityPanel,
  buildAspectPanel,
  buildStreaks,
  buildEmptyResponse,
  buildCardHits,
  buildDuplicates,
  buildShowcase,
} from './route.ts'
import { classifyAspect } from '@/src/services/expectedDistribution'
import { MIN_PACKS_PER_CARD } from '@/src/utils/stats'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROUTE_PATH = join(__dirname, 'route.ts')
const ROUTE_SRC = readFileSync(ROUTE_PATH, 'utf8')

const testUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'luck@example.com',
  username: 'luckuser',
  avatar_url: null,
  is_admin: false,
  is_beta_tester: false,
}

// ---------------------------------------------------------------------------
// Luck redesign widgets (cardHits / duplicates / showcase) — pure helpers
// ---------------------------------------------------------------------------

describe('buildCardHits', () => {
  it('emits one entry per expected card, sorted by collector number, with deltas', () => {
    const observed = new Map([['SET-002', 3], ['SET-001', 0]])
    const expected = new Map([['SET-001', 1], ['SET-002', 1]])
    const meta = new Map([
      ['SET-001', { number: 1, name: 'Alpha', aspects: ['Vigilance'] }],
      ['SET-002', { number: 2, name: 'Bravo', aspects: ['Command', 'Cunning'] }],
    ])
    const hits = buildCardHits(observed, expected, meta)
    assert.equal(hits.length, 2, 'one bar per expected card')
    assert.equal(hits[0].number, 1, 'sorted by collector number')
    assert.equal(hits[0].count, 0, 'unpulled card still appears')
    // SPEC: delta = observed - expected. Bravo: 3 - 1 = 2.
    assert.equal(hits[1].delta, 2)
  })
})

describe('buildDuplicates', () => {
  it('counts within-pool duplicates by card NAME (foil/HS = repeat of normal); expected is 0', () => {
    // One pool: a normal Vader + a Hyperspace Vader (same name) + one other card.
    const rows = [
      { card_name: 'Vader', card_id: 'uuid-normal-1', source_id: 'poolA', pack_index: 0 },
      { card_name: 'Vader', card_id: 'uuid-hyperspace-1', source_id: 'poolA', pack_index: 1 },
      { card_name: 'Luke', card_id: 'uuid-normal-2', source_id: 'poolA', pack_index: 2 },
    ] as any
    const dup = buildDuplicates(rows)
    // SPEC: 1 pool; duplicates = pulls - distinct names = 3 - 2 = 1 (the HS Vader
    // is a repeat of the normal Vader).
    assert.equal(dup.pools, 1)
    assert.equal(dup.actualPerPool, 1)
    // SPEC: the generator produces no duplicates within a pool — expected is 0.
    assert.equal(dup.expectedPerPool, 0)
  })
})

describe('buildShowcase', () => {
  it('counts showcase rows and scales the expected per-pack rate by packs', () => {
    const rows = [
      { card_id: 'A', is_showcase: true },
      { card_id: 'B', is_showcase: false },
      { card_id: 'C', is_showcase: true },
    ] as any
    // SPEC: 1/576 leader showcase rate over 100 packs ≈ 0.174 expected.
    const sc = buildShowcase(rows, 100, 1 / 576)
    assert.equal(sc.actualCount, 2)
    assert.ok(Math.abs(sc.actualRate - 2 / 100) < 1e-9)
    assert.ok(Math.abs(sc.expectedCount - 100 / 576) < 1e-9)
  })
})

let ipCounter = 0
function uniqueIp(): string {
  ipCounter++
  const a = (ipCounter >> 8) & 0xff
  const b = ipCounter & 0xff
  return `10.0.${a}.${b}`
}

function makeRequest(
  path: string,
  token?: string,
  opts: { ip?: string } = {},
): Request {
  const headers: Record<string, string> = {
    'x-forwarded-for': opts.ip || uniqueIp(),
  }
  if (token) headers['authorization'] = `Bearer ${token}`
  return new Request(`http://localhost${path}`, { headers })
}

// ---------------------------------------------------------------------------
// QUERY PARAM PARSERS
// ---------------------------------------------------------------------------

describe('parseDateParam', () => {
  it('returns null for null/empty input', () => {
    assert.strictEqual(parseDateParam(null), null)
    assert.strictEqual(parseDateParam(''), null)
  })

  it('returns trimmed value for a valid YYYY-MM-DD', () => {
    assert.strictEqual(parseDateParam('2024-03-14'), '2024-03-14')
  })

  it('throws on a non-date string', () => {
    assert.throws(() => parseDateParam('not-a-date'), /Invalid date format/)
  })

  it('throws on an impossible date that matches the regex', () => {
    assert.throws(() => parseDateParam('2024-13-99'), /Invalid date/)
  })
})

describe('parseScopeParam', () => {
  it('returns null for null/empty (caller falls back to "opened" default)', () => {
    assert.strictEqual(parseScopeParam(null), null)
    assert.strictEqual(parseScopeParam(''), null)
  })

  it('accepts "opened"', () => {
    assert.strictEqual(parseScopeParam('opened'), 'opened')
    assert.strictEqual(parseScopeParam('  opened  '), 'opened')
  })

  it('accepts "kept"', () => {
    assert.strictEqual(parseScopeParam('kept'), 'kept')
  })

  it('throws on any other value', () => {
    assert.throws(() => parseScopeParam('invalid'), /Invalid scope/)
    assert.throws(() => parseScopeParam('Opened'), /Invalid scope/)
    assert.throws(() => parseScopeParam('all'), /Invalid scope/)
  })
})

describe('parseSetCodeParam', () => {
  it('throws on null/empty input (setCode is required)', () => {
    assert.throws(() => parseSetCodeParam(null), /Missing required/)
    assert.throws(() => parseSetCodeParam(''), /Missing required/)
    assert.throws(() => parseSetCodeParam('   '), /Missing required/)
  })

  it('returns trimmed value for a valid set code', () => {
    assert.strictEqual(parseSetCodeParam('LAW'), 'LAW')
    assert.strictEqual(parseSetCodeParam(' SOR '), 'SOR')
    assert.strictEqual(parseSetCodeParam('LAW-CB'), 'LAW-CB')
  })

  it('throws on malformed setCode', () => {
    assert.throws(() => parseSetCodeParam('law'), /Invalid setCode/)
    assert.throws(() => parseSetCodeParam('TOOLONG'), /Invalid setCode/)
    assert.throws(() => parseSetCodeParam('1OR'), /Invalid setCode/)
  })
})

// ---------------------------------------------------------------------------
// AGGREGATION — observed counts
// ---------------------------------------------------------------------------

describe('aggregateObserved', () => {
  it('returns zero packsCracked / counts on empty input', () => {
    const out = aggregateObserved([])
    assert.strictEqual(out.packsCracked, 0)
    assert.strictEqual(out.rarity.Common, 0)
    assert.strictEqual(out.aspect.Vigilance, 0)
    assert.strictEqual(out.perCard.size, 0)
  })

  it('counts packsCracked as distinct (source_id, pack_index) pairs', () => {
    // 3 rows from pack (A, 0), 2 rows from (A, 1), 1 row from (B, 0)
    // → 3 distinct packs.
    const rows = [
      { card_id: 'LAW-001', rarity: 'Common', aspects: ['Vigilance'], pack_index: 0, source_id: 'A' },
      { card_id: 'LAW-002', rarity: 'Common', aspects: [], pack_index: 0, source_id: 'A' },
      { card_id: 'LAW-003', rarity: 'Rare', aspects: ['Command'], pack_index: 0, source_id: 'A' },
      { card_id: 'LAW-004', rarity: 'Common', aspects: ['Aggression'], pack_index: 1, source_id: 'A' },
      { card_id: 'LAW-005', rarity: 'Uncommon', aspects: ['Cunning'], pack_index: 1, source_id: 'A' },
      { card_id: 'LAW-006', rarity: 'Common', aspects: [], pack_index: 0, source_id: 'B' },
    ]
    const out = aggregateObserved(rows)
    assert.strictEqual(out.packsCracked, 3)
  })

  it('buckets rarity counts correctly', () => {
    const rows = [
      { card_id: 'a', rarity: 'Common', aspects: [], pack_index: 0, source_id: 'x' },
      { card_id: 'b', rarity: 'Common', aspects: [], pack_index: 0, source_id: 'x' },
      { card_id: 'c', rarity: 'Uncommon', aspects: [], pack_index: 0, source_id: 'x' },
      { card_id: 'd', rarity: 'Rare', aspects: [], pack_index: 0, source_id: 'x' },
      { card_id: 'e', rarity: 'Legendary', aspects: [], pack_index: 0, source_id: 'x' },
    ]
    const out = aggregateObserved(rows)
    assert.strictEqual(out.rarity.Common, 2)
    assert.strictEqual(out.rarity.Uncommon, 1)
    assert.strictEqual(out.rarity.Rare, 1)
    assert.strictEqual(out.rarity.Legendary, 1)
  })

  it('ignores rarities outside the spec-tracked four (Special, null)', () => {
    const rows = [
      { card_id: 'a', rarity: 'Special', aspects: [], pack_index: 0, source_id: 'x' },
      { card_id: 'b', rarity: null, aspects: [], pack_index: 0, source_id: 'x' },
      { card_id: 'c', rarity: 'Common', aspects: [], pack_index: 0, source_id: 'x' },
    ]
    const out = aggregateObserved(rows)
    assert.strictEqual(out.rarity.Common, 1)
    // Total observed across the four buckets = 1; Special and null don't
    // land anywhere.
    assert.strictEqual(
      out.rarity.Common + out.rarity.Uncommon + out.rarity.Rare + out.rarity.Legendary,
      1,
    )
  })

  it('classifies aspect categories using the same U3 classifier', () => {
    // The route MUST classify identically to U3 so observed and expected
    // line up bucket-for-bucket. Drive both through the same helper.
    const cards = [
      { aspects: ['Vigilance'] },           // -> Vigilance
      { aspects: ['Command'] },             // -> Command
      { aspects: ['Aggression', 'Heroism'] }, // -> Aggression (alignment not counted)
      { aspects: ['Cunning', 'Villainy'] },  // -> Cunning
      { aspects: [] },                       // -> Neutral
      { aspects: ['Heroism'] },              // -> Neutral (no color)
      { aspects: ['Vigilance', 'Command'] }, // -> Multicolor
    ]
    const rows = cards.map((c, i) => ({
      card_id: `c${i}`,
      rarity: 'Common',
      aspects: c.aspects,
      pack_index: i,
      source_id: 'x',
    }))
    const out = aggregateObserved(rows)
    assert.strictEqual(out.aspect.Vigilance, 1)
    assert.strictEqual(out.aspect.Command, 1)
    assert.strictEqual(out.aspect.Aggression, 1)
    assert.strictEqual(out.aspect.Cunning, 1)
    assert.strictEqual(out.aspect.Neutral, 2)
    assert.strictEqual(out.aspect.Multicolor, 1)
  })

  it('matches the U3 classifyAspect output exactly (parity check)', () => {
    // Programmatic check: the route's aggregator must call into
    // classifyAspect — verify a tricky case yields the same answer when
    // computed directly vs via aggregateObserved.
    const tricky = { aspects: ['Vigilance', 'Cunning', 'Heroism'] }
    const direct = classifyAspect(tricky)
    const rows = [{ card_id: 'x', rarity: 'Common', aspects: tricky.aspects, pack_index: 0, source_id: 's' }]
    const out = aggregateObserved(rows)
    assert.strictEqual(out.aspect[direct], 1, `aggregateObserved must bucket into the same ${direct} as classifyAspect`)
  })

  it('builds the per-card observed Map keyed by card_id', () => {
    const rows = [
      { card_id: 'LAW-032', rarity: 'Legendary', aspects: [], pack_index: 0, source_id: 'A' },
      { card_id: 'LAW-032', rarity: 'Legendary', aspects: [], pack_index: 1, source_id: 'A' },
      { card_id: 'LAW-001', rarity: 'Common', aspects: [], pack_index: 0, source_id: 'A' },
    ]
    const out = aggregateObserved(rows)
    assert.strictEqual(out.perCard.get('LAW-032'), 2)
    assert.strictEqual(out.perCard.get('LAW-001'), 1)
  })

  it('handles null aspects array (treats as Neutral)', () => {
    const rows = [
      { card_id: 'x', rarity: 'Common', aspects: null, pack_index: 0, source_id: 'A' },
    ]
    const out = aggregateObserved(rows)
    assert.strictEqual(out.aspect.Neutral, 1)
  })
})

// ---------------------------------------------------------------------------
// PANEL BUILDERS
// ---------------------------------------------------------------------------

describe('buildRarityPanel', () => {
  it('includes every rarity bucket in perRarity', () => {
    const out = buildRarityPanel(
      { Common: 0, Uncommon: 0, Rare: 0, Legendary: 0 },
      { Common: 0, Uncommon: 0, Rare: 0, Legendary: 0 },
      0,
    )
    assert.deepStrictEqual(
      Object.keys(out.perRarity).sort(),
      ['Common', 'Legendary', 'Rare', 'Uncommon'],
    )
  })

  it('includes platform actuals normalized to the player pack count', () => {
    const out = buildRarityPanel(
      { Common: 20, Uncommon: 8, Rare: 2, Legendary: 1 },
      { Common: 21, Uncommon: 7, Rare: 2.5, Legendary: 0.5 },
      10,
      { Common: 19.5, Uncommon: 8.2, Rare: 2.1, Legendary: 0.4 },
      500,
    )

    assert.strictEqual(out.platformActual.Common, 19.5)
    assert.strictEqual(out.platformActual.Legendary, 0.4)
    assert.strictEqual(out.platformPacksCracked, 500)
  })

  it('returns insufficient regime when packsCracked is below MIN_PACKS_RARITY', () => {
    // n=10 << MIN_PACKS_RARITY (120 per stats.ts).
    const out = buildRarityPanel(
      { Common: 5, Uncommon: 2, Rare: 1, Legendary: 0 },
      { Common: 6, Uncommon: 1.8, Rare: 0.55, Legendary: 0.08 },
      10,
    )
    assert.strictEqual(out.headlineRegime, 'insufficient')
    assert.ok(/(more|few)/i.test(out.headlineCopy), `expected "more packs" wording, got: ${out.headlineCopy}`)
  })
})

describe('buildAspectPanel', () => {
  it('includes every aspect bucket in perAspect', () => {
    const out = buildAspectPanel(
      { Vigilance: 0, Command: 0, Aggression: 0, Cunning: 0, Neutral: 0, Multicolor: 0 },
      { Vigilance: 0, Command: 0, Aggression: 0, Cunning: 0, Neutral: 0, Multicolor: 0 },
      0,
    )
    assert.deepStrictEqual(
      Object.keys(out.perAspect).sort(),
      ['Aggression', 'Command', 'Cunning', 'Multicolor', 'Neutral', 'Vigilance'],
    )
  })

  it('includes platform actuals normalized to the player pack count', () => {
    const out = buildAspectPanel(
      { Vigilance: 20, Command: 18, Aggression: 17, Cunning: 16, Neutral: 8, Multicolor: 2 },
      { Vigilance: 19, Command: 19, Aggression: 19, Cunning: 19, Neutral: 8, Multicolor: 1 },
      10,
      { Vigilance: 20.5, Command: 18.5, Aggression: 17.5, Cunning: 16.5, Neutral: 8.5, Multicolor: 1.5 },
      800,
    )

    assert.strictEqual(out.platformActual.Vigilance, 20.5)
    assert.strictEqual(out.platformActual.Multicolor, 1.5)
    assert.strictEqual(out.platformPacksCracked, 800)
  })

  it('picks the most-surprising aspect as the headline driver', () => {
    // n large enough to clear MIN_PACKS_ASPECT (60); use small expected
    // so the Poisson approximation in luckVerdict kicks in (expected < 10).
    //
    // Multicolor expected=5; observed=15 → 3x. P(X >= 15 | lambda=5) is
    // tiny (≈ 4.4e-5 two-sided), well under 0.05. Five other aspects at
    // exactly expected → normal. Headline driver must be Multicolor.
    //
    // We pick Multicolor because its real-world per-pack expected IS
    // small enough that Poisson applies — the four color aspects each
    // have per-pack expected ≈ 2.33, which scales to expected > n for
    // any reasonable pack count and breaks the binomial model. The
    // small-expected case is the one the model handles cleanly today;
    // U6 calls verdict() per aspect and gets back whatever regime the
    // service decides for each.
    const n = 100
    const observed = {
      Vigilance: 200,
      Command: 200,
      Aggression: 200,
      Cunning: 200,
      Neutral: 80,
      Multicolor: 15,
    }
    const expected = {
      Vigilance: 200,
      Command: 200,
      Aggression: 200,
      Cunning: 200,
      Neutral: 80,
      Multicolor: 5,
    }
    const out = buildAspectPanel(observed, expected, n)
    assert.strictEqual(out.headlineRegime, 'unusual')
    assert.strictEqual(out.headlineLabel, 'Multicolor')
    assert.match(out.headlineCopy, /Multicolor/, 'headline copy should name the driver aspect')
  })

  it('picks worstRegime: unusual > insufficient > normal', () => {
    // 5 aspects normal, 1 unusual → headline is unusual.
    // Use small expected for the unusual driver so Poisson handles it.
    const n = 100
    const observed = {
      Vigilance: 100, Command: 100, Aggression: 100,
      Cunning: 100, Neutral: 50,
      Multicolor: 15, // unusual against expected=5
    }
    const expected = {
      Vigilance: 100, Command: 100, Aggression: 100,
      Cunning: 100, Neutral: 50,
      Multicolor: 5,
    }
    const out = buildAspectPanel(observed, expected, n)
    assert.strictEqual(out.headlineRegime, 'unusual')
  })
})

// ---------------------------------------------------------------------------
// STREAKS
// ---------------------------------------------------------------------------

describe('buildStreaks', () => {
  it('returns empty list when nothing qualifies', () => {
    // Below MIN_PACKS_PER_CARD → nothing can qualify regardless of
    // observed/expected gap.
    const out = buildStreaks(
      new Map([['a', 0]]),
      new Map([['a', 0.1]]),
      MIN_PACKS_PER_CARD - 1,
      (id) => id,
    )
    assert.deepStrictEqual(out.streaks, [])
    assert.strictEqual(out.hasMore, false)
  })

  it('uses the expected Map as the candidate iterator (not observed)', () => {
    // Card X has expected pulls but observed=0 (user never pulled it).
    // If we iterate observed we miss this; iterating expected catches it.
    // With a stiff enough expected vs zero observed and enough packs,
    // it should appear as a streak.
    const expected = new Map<string, number>([
      // expected=20 over n=400 → p=0.05; observed=0 is a tail event.
      ['LAW-zero', 20],
    ])
    const observed = new Map<string, number>() // user observed nothing
    const out = buildStreaks(observed, expected, 400, (id) => id)
    // We expect this to surface — but only if MIN_PACKS_PER_CARD allows
    // it. MIN_PACKS_PER_CARD = 200 per stats.ts, so 400 is fine.
    assert.strictEqual(out.streaks.length, 1)
    assert.strictEqual(out.streaks[0].cardId, 'LAW-zero')
    assert.strictEqual(out.streaks[0].observed, 0)
    assert.strictEqual(out.streaks[0].expected, 20)
  })

  it('caps at 10 entries with hasMore=true', () => {
    // Build 20 candidates that all qualify.
    const expected = new Map<string, number>()
    for (let i = 0; i < 20; i++) {
      // observed=0 with large expected ⇒ very small p-value.
      expected.set(`card-${i}`, 50)
    }
    const observed = new Map<string, number>()
    const out = buildStreaks(observed, expected, 400, (id) => `Name of ${id}`)
    assert.strictEqual(out.streaks.length, 10, 'capped at 10')
    assert.strictEqual(out.hasMore, true, 'hasMore set when capped')
    // Each one should resolve a cardName via the lookup.
    assert.match(out.streaks[0].cardName, /^Name of /)
  })

  it('sorts results by p-value ascending (most surprising first)', () => {
    const expected = new Map<string, number>([
      ['mild', 10], // small deviation
      ['extreme', 50], // huge deviation
    ])
    const observed = new Map<string, number>([
      ['mild', 5],     // half of expected
      ['extreme', 0],  // none of expected — way worse
    ])
    const out = buildStreaks(observed, expected, 400, (id) => id)
    // "extreme" should rank first (smaller p-value, more surprising).
    assert.ok(out.streaks.length >= 1, 'at least one streak surfaced')
    if (out.streaks.length >= 2) {
      assert.strictEqual(out.streaks[0].cardId, 'extreme', 'most surprising first')
      assert.ok(
        out.streaks[0].pValue <= out.streaks[1].pValue,
        'p-values are ascending',
      )
    }
  })

  it('uses isInterestingStreak to filter routine deviations', () => {
    // observed exactly equal to expected with adequate n — should NOT
    // pass isInterestingStreak (it's normal, not interesting).
    const expected = new Map<string, number>([['boring', 5]])
    const observed = new Map<string, number>([['boring', 5]])
    const out = buildStreaks(observed, expected, 400, (id) => id)
    assert.strictEqual(out.streaks.length, 0, 'routine deviations are not streaks')
  })
})

// ---------------------------------------------------------------------------
// EMPTY-RESPONSE PATH
// ---------------------------------------------------------------------------

describe('buildEmptyResponse', () => {
  it('returns the full shape with packsCracked=0', () => {
    const body = buildEmptyResponse('LAW', 'opened')
    assert.strictEqual(body.setCode, 'LAW')
    assert.strictEqual(body.scope, 'opened')
    assert.strictEqual(body.packsCracked, 0)
    assert.ok(body.rarity, 'rarity panel present')
    assert.ok(body.aspect, 'aspect panel present')
    assert.deepStrictEqual(body.streaks, [])
    assert.strictEqual(body.streaksHasMore, false)
  })

  it('every rarity bucket is in the insufficient regime', () => {
    const body = buildEmptyResponse('LAW', 'opened')
    for (const r of ['Common', 'Uncommon', 'Rare', 'Legendary']) {
      assert.strictEqual(
        body.rarity.perRarity[r].regime,
        'insufficient',
        `${r} should be insufficient when packsCracked=0`,
      )
    }
    assert.strictEqual(body.rarity.headlineRegime, 'insufficient')
  })

  it('every aspect bucket is in the insufficient regime', () => {
    const body = buildEmptyResponse('LAW', 'kept')
    for (const a of ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Neutral', 'Multicolor']) {
      assert.strictEqual(
        body.aspect.perAspect[a].regime,
        'insufficient',
        `${a} should be insufficient when packsCracked=0`,
      )
    }
    assert.strictEqual(body.aspect.headlineRegime, 'insufficient')
  })
})

// ---------------------------------------------------------------------------
// HANDLER — auth, rate-limit, validation
// ---------------------------------------------------------------------------

describe('GET /api/stats/me/luck — auth & rate-limit', () => {
  beforeEach(() => {
    rateLimitStore.clear()
  })

  it('returns 401 without auth (unauthenticated)', async () => {
    const { GET } = await import('./route.ts')
    const req = makeRequest('/api/stats/me/luck?setCode=LAW')
    const res = await GET(req)
    assert.strictEqual(res.status, 401)
    const body = await res.json()
    assert.strictEqual(body.success, false)
    assert.ok(/Authentication/i.test(body.message))
  })

  it('returns 400 when setCode is missing', async () => {
    const { GET } = await import('./route.ts')
    const token = createToken(testUser)
    const req = makeRequest('/api/stats/me/luck', token)
    const res = await GET(req)
    assert.strictEqual(res.status, 400)
    const body = await res.json()
    assert.ok(/setCode/i.test(body.message || ''))
  })

  it('returns 400 when scope is invalid', async () => {
    const { GET } = await import('./route.ts')
    const token = createToken(testUser)
    const req = makeRequest('/api/stats/me/luck?setCode=LAW&scope=banana', token)
    const res = await GET(req)
    assert.strictEqual(res.status, 400)
    const body = await res.json()
    assert.ok(/scope/i.test(body.message || ''))
  })

  it('returns 400 when setCode has bad shape', async () => {
    const { GET } = await import('./route.ts')
    const token = createToken(testUser)
    const req = makeRequest('/api/stats/me/luck?setCode=lowercase', token)
    const res = await GET(req)
    assert.strictEqual(res.status, 400)
    const body = await res.json()
    assert.ok(/setCode/i.test(body.message || ''))
  })

  it('returns 400 for an invalid since date', async () => {
    const { GET } = await import('./route.ts')
    const token = createToken(testUser)
    const req = makeRequest(
      '/api/stats/me/luck?setCode=LAW&since=not-a-date',
      token,
    )
    const res = await GET(req)
    assert.strictEqual(res.status, 400)
  })

  it('returns 429 when rate limit is exceeded', async () => {
    const { GET } = await import('./route.ts')
    const ip = '192.168.99.43'
    const token = createToken(testUser)
    // Burn the budget.
    for (let i = 0; i < MAX_REQUESTS; i++) {
      const r = makeRequest('/api/stats/me/luck?setCode=LAW', undefined, { ip })
      await GET(r)
    }
    const blocked = await GET(
      makeRequest('/api/stats/me/luck?setCode=LAW', token, { ip }),
    )
    assert.strictEqual(blocked.status, 429, 'request past the budget is rate-limited')
    const body = await blocked.json()
    assert.ok(/too many/i.test(body.error || body.message || ''))
  })
})

// ---------------------------------------------------------------------------
// SQL-SHAPE — spec asserted against route source
// ---------------------------------------------------------------------------

describe('SQL semantics (spec asserted against route source)', () => {
  describe('scope=opened — draft side', () => {
    it('JOIN pp ON pp.user_id = $1 (explicit user_id on JOIN, not just WHERE)', () => {
      // Plan calls out this as load-bearing: without pp.user_id on the
      // JOIN, the seat predicate alone could match bot rows in
      // adversarial pod configurations.
      assert.match(
        ROUTE_SRC,
        /JOIN pod_players pp ON pp\.pod_id = p\.id[\s\S]*?AND pp\.user_id = \$1/,
        'pp.user_id is on the JOIN clause itself',
      )
    })

    it('JOIN pp ON pp.is_bot = false (bots excluded at JOIN time)', () => {
      assert.match(
        ROUTE_SRC,
        /JOIN pod_players pp ON pp\.pod_id = p\.id[\s\S]*?AND pp\.is_bot = false/,
        'pp.is_bot = false is on the JOIN clause',
      )
    })

    it('has a standard-mode branch using floor(pack_index / packsPerPlayer)', () => {
      assert.match(
        ROUTE_SRC,
        /draftMode[\s\S]*?<>[\s\S]*?'chaos'[\s\S]*?floor\(cg\.pack_index::int \/ COALESCE\(jsonb_array_length\(p\.settings->'chaosSets'\),\s*3\)/,
        'standard branch: seat = floor(pack_index / packsPerPlayer) + 1',
      )
    })

    it('has a chaos-mode branch using pack_index % 8', () => {
      assert.match(
        ROUTE_SRC,
        /'draftMode'[\s\S]*?=\s*'chaos'[\s\S]*?cg\.pack_index::int %\s*8/,
        'chaos branch: seat = (pack_index % 8) + 1',
      )
    })

    it("derives packsPerPlayer via COALESCE(jsonb_array_length(p.settings->'chaosSets'), 3)", () => {
      // pods has no packs_per_player column — verified against the U5
      // summary route, which uses the same JSONB approach.
      assert.match(
        ROUTE_SRC,
        /COALESCE\(jsonb_array_length\(p\.settings->'chaosSets'\),\s*3\)/,
        'packs_per_player derived from JSONB',
      )
    })

    it('compares against 1-indexed seat_number (host=1)', () => {
      // pp.seat_number is 1-indexed. The 0-indexed packOpenerSeat math
      // must be adjusted by +1 on at least one branch.
      assert.match(
        ROUTE_SRC,
        /pp\.seat_number = floor[\s\S]*?\+ 1/,
        'standard branch adjusts to 1-indexed seat_number',
      )
      assert.match(
        ROUTE_SRC,
        /pp\.seat_number = \(cg\.pack_index::int % 8\) \+ 1/,
        'chaos branch adjusts to 1-indexed seat_number',
      )
    })

    it('uses the half-open date filter on cg.generated_at', () => {
      assert.match(
        ROUTE_SRC,
        /cg\.generated_at >= \$3[\s\S]*?cg\.generated_at < \(\$4::date \+ interval '1 day'\)/,
        'half-open >= since AND < (until + 1 day) on generated_at',
      )
    })

    it("filters by cg.source_type = 'draft' on the draft side", () => {
      assert.match(
        ROUTE_SRC,
        /OPENED_DRAFT_SQL[\s\S]*?cg\.source_type = 'draft'/,
        "draft side gated to source_type='draft'",
      )
    })
  })

  describe('scope=opened — sealed side', () => {
    it("joins card_pools cp on cp.user_id = $1 (ownership)", () => {
      assert.match(
        ROUTE_SRC,
        /OPENED_SEALED_SQL[\s\S]*?JOIN card_pools cp ON cp\.id = cg\.source_id[\s\S]*?cp\.user_id = \$1/,
        'sealed cracker is pool owner',
      )
    })

    it("filters by cg.source_type = 'sealed' on the sealed side", () => {
      assert.match(
        ROUTE_SRC,
        /OPENED_SEALED_SQL[\s\S]*?cg\.source_type = 'sealed'/,
        "sealed side gated to source_type='sealed'",
      )
    })

    it('uses the half-open date filter on cg.generated_at', () => {
      assert.match(
        ROUTE_SRC,
        /OPENED_SEALED_SQL[\s\S]*?cg\.generated_at >= \$3[\s\S]*?cg\.generated_at < \(\$4::date \+ interval '1 day'\)/,
        'half-open >= since AND < (until + 1 day) on sealed side',
      )
    })
  })

  describe('scope=kept', () => {
    it('reads card_generations.user_id = $1 directly (relies on U9 backfill)', () => {
      assert.match(
        ROUTE_SRC,
        /KEPT_SQL[\s\S]*?WHERE user_id = \$1/,
        'scope=kept queries user_id directly',
      )
    })

    it('filters by set_code = $2', () => {
      assert.match(
        ROUTE_SRC,
        /KEPT_SQL[\s\S]*?set_code = \$2/,
        'kept query filters by set_code',
      )
    })

    it('uses the half-open date filter', () => {
      assert.match(
        ROUTE_SRC,
        /KEPT_SQL[\s\S]*?generated_at >= \$3[\s\S]*?generated_at < \(\$4::date \+ interval '1 day'\)/,
        'kept query uses half-open date filter',
      )
    })
  })

  describe('platform actuals', () => {
    it('queries platform kept pulls with the same set and half-open date filters', () => {
      assert.match(
        ROUTE_SRC,
        /PLATFORM_KEPT_SQL[\s\S]*?user_id IS NOT NULL[\s\S]*?set_code = \$1[\s\S]*?generated_at >= \$2[\s\S]*?generated_at < \(\$3::date \+ interval '1 day'\)/,
      )
    })

    it('queries platform opened pulls independently from the current user', () => {
      assert.match(
        ROUTE_SRC,
        /PLATFORM_OPENED_SQL[\s\S]*?FROM card_generations[\s\S]*?WHERE set_code = \$1[\s\S]*?generated_at >= \$2[\s\S]*?generated_at < \(\$3::date \+ interval '1 day'\)/,
      )
    })

    it('scales platform actuals down to the current player pack count before panel construction', () => {
      assert.match(ROUTE_SRC, /function scaleActualsToPlayerPacks/)
      assert.match(ROUTE_SRC, /targetPacks \/ sourcePacks/)
      assert.match(ROUTE_SRC, /platformRarityForPlayerPacks[\s\S]*?buildRarityPanel/)
      assert.match(ROUTE_SRC, /platformAspectForPlayerPacks[\s\S]*?buildAspectPanel/)
      assert.match(ROUTE_SRC, /platformObserved\.packsCracked/)
    })
  })

  describe('headers', () => {
    it('sets Cache-Control: private, max-age=60', () => {
      assert.match(
        ROUTE_SRC,
        /Cache-Control[^\n]*private, max-age=60/,
        'response is private (not public)',
      )
      // Defense-in-depth: must NOT use the public cache header pattern
      // from /api/stats/draft-picks.
      assert.doesNotMatch(
        ROUTE_SRC,
        /'Cache-Control', 'public/,
        'must not use the public cache header from /api/stats/*',
      )
    })

    it("sets Vary: Cookie (defense-in-depth against edge mis-caching)", () => {
      assert.match(
        ROUTE_SRC,
        /'Vary', 'Cookie'/,
        'Vary: Cookie prevents cross-user mis-caching on edge',
      )
    })
  })

  describe('auth & rate limiting (pattern parity with U5 + app/api/me/*)', () => {
    it('applies the rate limit before auth', () => {
      assert.match(
        ROUTE_SRC,
        /applyRateLimit\(request\)[\s\S]*?requireAuth\(request\)/,
        'rate limit is checked first, then auth',
      )
    })

    it('uses requireAuth (the me/* convention)', () => {
      assert.match(
        ROUTE_SRC,
        /requireAuth\(request\)/,
        'follows the me/* auth convention',
      )
    })
  })

  describe('streaks privacy', () => {
    it('includes a PRIVACY note about not exposing streaks in shareable views', () => {
      // The plan calls this out explicitly. Keep the comment marker in
      // the route source so a future maintainer searching for it finds
      // the constraint.
      assert.match(
        ROUTE_SRC,
        /PRIVACY/,
        'route source documents the privacy constraint',
      )
    })
  })
})

// ---------------------------------------------------------------------------
// DOCUMENTED SCENARIOS FROM THE U6 PLAN (behavioral spec)
// ---------------------------------------------------------------------------

describe('Documented scenarios from the U6 plan (behavioral spec)', () => {
  it('Empty set: user with no activity → packsCracked=0, all dimensions insufficient', () => {
    const body = buildEmptyResponse('LAW', 'opened')
    assert.strictEqual(body.packsCracked, 0)
    assert.strictEqual(body.rarity.headlineRegime, 'insufficient')
    assert.strictEqual(body.aspect.headlineRegime, 'insufficient')
    assert.deepStrictEqual(body.streaks, [])
  })

  it('Aspect headline names the driving aspect (AE2)', () => {
    // Per plan: "Your Vigilance share is meaningfully above expected..."
    // — the copy must name the specific aspect, not just say "an aspect."
    // We drive the unusual verdict via the Multicolor aspect (small
    // expected so Poisson model handles cleanly) and confirm the
    // headline labels that specific aspect by name.
    const n = 100
    const out = buildAspectPanel(
      {
        Vigilance: 200, Command: 200, Aggression: 200,
        Cunning: 200, Neutral: 80, Multicolor: 15,
      },
      {
        Vigilance: 200, Command: 200, Aggression: 200,
        Cunning: 200, Neutral: 80, Multicolor: 5,
      },
      n,
    )
    assert.strictEqual(out.headlineLabel, 'Multicolor')
    assert.match(out.headlineCopy, /Multicolor/)
  })

  it('Streaks capped at 10 with hasMore=true when more qualify (AE4)', () => {
    const expected = new Map<string, number>()
    for (let i = 0; i < 20; i++) expected.set(`c${i}`, 50)
    const out = buildStreaks(new Map(), expected, 400, (id) => id)
    assert.strictEqual(out.streaks.length, 10)
    assert.strictEqual(out.hasMore, true)
  })

  it('Below MIN_PACKS_RARITY → headline is insufficient regardless of observed gap (AE1)', () => {
    // Even with a 2x deviation, n=10 is too small.
    const out = buildRarityPanel(
      { Common: 50, Uncommon: 15, Rare: 4, Legendary: 4 }, // wildly above expected
      { Common: 60, Uncommon: 18, Rare: 0.55, Legendary: 0.08 },
      10, // << MIN_PACKS_RARITY = 120
    )
    assert.strictEqual(out.headlineRegime, 'insufficient')
  })
})

console.log('\nRunning /api/stats/me/luck tests...\n')
