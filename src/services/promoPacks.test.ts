/**
 * Tests for the GC 2026 promo-pack service (plan U2).
 *
 * Spec-first: window dates, pack size, and pool membership are asserted against the catalog
 * (src/services/promoPacks.catalog.ts) and the requirements (claim window = Jul 24–26 2026 LA).
 */

import assert from 'node:assert/strict'
import { getCampaign, isClaimWindowOpen, isClaimAllowed, drawEventPack } from './promoPacks'
import { GC2026_CAMPAIGN, type PromoCampaign } from './promoPacks.catalog'

let passed = 0
let failed = 0
function it(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`) }
}

console.log('='.repeat(60))
console.log('Testing GC 2026 Promo-Pack Service (U2)')
console.log('='.repeat(60))

// ── getCampaign ──
it('getCampaign resolves gc2026 and returns null for unknown', () => {
  assert.equal(getCampaign('gc2026')?.id, 'gc2026')
  assert.equal(getCampaign('nope'), null)
})

// ── isClaimWindowOpen — SPEC: GC weekend only, Jul 24–26 2026 America/Los_Angeles ──
const laNoon = (d: string) => new Date(`${d}T12:00:00-07:00`) // PDT is UTC-7 in July

it('open on each day of GC weekend (Jul 24, 25, 26 LA)', () => {
  for (const d of ['2026-07-24', '2026-07-25', '2026-07-26']) {
    assert.equal(isClaimWindowOpen(GC2026_CAMPAIGN, laNoon(d)), true, `expected ${d} open`)
  }
})

it('closed the day before and the day after (Jul 23 / Jul 27 LA)', () => {
  assert.equal(isClaimWindowOpen(GC2026_CAMPAIGN, laNoon('2026-07-23')), false)
  assert.equal(isClaimWindowOpen(GC2026_CAMPAIGN, laNoon('2026-07-27')), false)
})

it('boundaries are inclusive at the LA day edges', () => {
  // 23:30 on Jul 26 LA → still open; 00:30 on Jul 27 LA → closed.
  assert.equal(isClaimWindowOpen(GC2026_CAMPAIGN, new Date('2026-07-26T23:30:00-07:00')), true)
  assert.equal(isClaimWindowOpen(GC2026_CAMPAIGN, new Date('2026-07-27T00:30:00-07:00')), false)
})

it('uses the LA calendar date, not UTC', () => {
  // 06:00Z Jul 24 = 23:00 PDT Jul 23 → closed; 08:00Z Jul 24 = 01:00 PDT Jul 24 → open.
  assert.equal(isClaimWindowOpen(GC2026_CAMPAIGN, new Date('2026-07-24T06:00:00Z')), false)
  assert.equal(isClaimWindowOpen(GC2026_CAMPAIGN, new Date('2026-07-24T08:00:00Z')), true)
})

// ── isClaimAllowed — override opens the window in non-prod only ──
it('override opens the window; without it, the real check applies', () => {
  const outside = laNoon('2026-07-01')
  assert.equal(isClaimAllowed(GC2026_CAMPAIGN, outside), false)
  assert.equal(isClaimAllowed(GC2026_CAMPAIGN, outside, { overrideOpen: true }), true)
  // Inside the window, allowed regardless of override.
  assert.equal(isClaimAllowed(GC2026_CAMPAIGN, laNoon('2026-07-25')), true)
})

// ── drawEventPack ──
const idOnly = (cardId: string) => ({ id: cardId })

it('draws exactly packSize (2) cards, all from the requested tier pool', () => {
  const pack = drawEventPack(GC2026_CAMPAIGN, 'silver', idOnly, () => 0)
  assert.equal(pack.cards.length, GC2026_CAMPAIGN.packSize)
  assert.equal(pack.cards.length, 2)
  for (const c of pack.cards) {
    assert.ok(GC2026_CAMPAIGN.pools.silver.includes(c.id), `${c.id} not in silver pool`)
  }
})

it('draws distinct cards (no duplicate within a pack)', () => {
  // rng cycling through values still yields distinct picks (sample-without-replacement).
  const seq = [0.9, 0.1, 0.5, 0.3]
  let i = 0
  const rng = () => seq[i++ % seq.length]
  const pack = drawEventPack(GC2026_CAMPAIGN, 'black', idOnly, rng)
  const ids = pack.cards.map(c => c.id)
  assert.equal(new Set(ids).size, ids.length, `duplicate in ${ids.join(',')}`)
})

it('returns all cards when the pool is smaller than packSize', () => {
  const tiny: PromoCampaign = {
    ...GC2026_CAMPAIGN,
    pools: { silver: ['only-one'], black: [] },
  }
  assert.equal(drawEventPack(tiny, 'silver', idOnly, () => 0).cards.length, 1)
  assert.equal(drawEventPack(tiny, 'black', idOnly, () => 0).cards.length, 0)
})

it('drops unresolvable card ids (no fabricated cards)', () => {
  const resolveNull = () => null
  assert.equal(drawEventPack(GC2026_CAMPAIGN, 'silver', resolveNull, () => 0).cards.length, 0)
})

it('SPEC: silver and black pools are disjoint and non-empty', () => {
  const silver = new Set(GC2026_CAMPAIGN.pools.silver)
  const black = GC2026_CAMPAIGN.pools.black
  assert.ok(silver.size > 0 && black.length > 0)
  for (const id of black) assert.equal(silver.has(id), false, `${id} in both pools`)
})

console.log('\n' + '='.repeat(60))
console.log(`U2 promo-pack service: ${passed} passed, ${failed} failed`)
console.log('='.repeat(60))
if (failed > 0) process.exit(1)
