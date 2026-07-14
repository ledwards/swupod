/**
 * Tests for the GC 2026 promo-card stopgap injection (plan U1).
 *
 * Spec source: src/data/promoPacks/gc2026-cards.json — the catalog IS the spec for which
 * promo ids exist, what they clone from, and their image URLs. These tests assert the
 * transform honors that spec and preserves the promo-collapse guard for the OTHER variants.
 */

import { applyCardFixes } from '../src/utils/cardFixes'
import gc2026Catalog from '../src/data/promoPacks/gc2026-cards.json' with { type: 'json' }

console.log('='.repeat(60))
console.log('Testing GC 2026 Promo Injection (U1)')
console.log('='.repeat(60))

const CATALOG = (gc2026Catalog as { cards: any[] }).cards

/** Run the runtime fix chain, returning the fixed cards loosely typed for assertions. */
function fixCards(cards: any[]): any[] {
  return (applyCardFixes({ cards, metadata: {} } as any) as any).cards
}

/** Build a minimal Normal source card that a catalog entry clones from. */
function sourceCardFor(entry: any): any {
  return {
    id: entry.sourceCardId,
    cardId: 'XXX-001',            // shared base printing number
    number: '001',
    name: entry.name,
    subtitle: entry.subtitle,
    set: entry.set,
    type: entry.category === 'Alt-Art Base' ? 'Base' : 'Unit',
    rarity: 'Rare',
    variantType: 'Normal',
    imageUrl: 'https://cdn.starwarsunlimited.com/source_normal.png',
  }
}

/** Test 1 — each catalog entry with a present source is injected as a distinct promo. */
function testInjectsPromos(): boolean {
  console.log('\n[Test 1] Injects a GC 2026 promo cloned from its source')
  const entry = CATALOG[0]
  const input = { cards: [sourceCardFor(entry)], metadata: {} }

  const out = fixCards(input.cards)
  const promo = out.find((c: any) => c.id === entry.id)
  const source = out.find((c: any) => c.id === entry.sourceCardId)

  if (!promo) { console.error(`  ❌ Injected promo ${entry.id} missing`); return false }
  if (promo.variantType !== 'GC 2026 Promo') { console.error(`  ❌ Wrong variantType: ${promo.variantType}`); return false }
  if (!source) { console.error('  ❌ Source Normal card was dropped'); return false }
  if (promo.id === source.id) { console.error('  ❌ Promo shares id with source'); return false }
  if (!promo.imageUrl) { console.error('  ❌ Promo has no imageUrl'); return false }
  if (promo.gcPromo?.campaign !== 'gc2026') { console.error('  ❌ Missing gcPromo.campaign'); return false }

  console.log(`  ✓ ${entry.id} injected as 'GC 2026 Promo'`)
  console.log('  ✓ Source Normal card preserved (distinct id)')
  console.log('  ✓ Promo carries an imageUrl and gcPromo metadata')
  return true
}

/** Test 2 — promo shares the base printing's cardId but is a distinct object (collision guard). */
function testSharesCardIdDistinctId(): boolean {
  console.log('\n[Test 2] Promo shares cardId/number with source but has a distinct id')
  const entry = CATALOG[0]
  const out = fixCards([sourceCardFor(entry)])
  const promo = out.find((c: any) => c.id === entry.id)
  const source = out.find((c: any) => c.id === entry.sourceCardId)

  if (promo.cardId !== source.cardId) { console.error('  ❌ Promo should reuse the base cardId (stopgap stand-in)'); return false }
  if (promo.id === source.id) { console.error('  ❌ id must be unique per variant'); return false }
  console.log('  ✓ cardId shared, id unique — id remains the only unique key')
  return true
}

/** Test 3 — the whitelist was NOT widened: old promo variants stay filtered out. */
function testOldPromosStillFiltered(): boolean {
  console.log('\n[Test 3] Non-GC promo variants remain filtered (allowlist unchanged)')
  const input = {
    cards: [
      { id: 'wp-1', cardId: 'SHD-002', name: 'Old Promo', set: 'SHD', type: 'Unit', variantType: 'Weekly Play' },
      { id: 'pq-1', cardId: 'SHD-003', name: 'Old PQ', set: 'SHD', type: 'Unit', variantType: 'PQ Champion' },
      { id: 'ss-1', cardId: 'SHD-004', name: 'Old SS', set: 'SHD', type: 'Unit', variantType: 'SS Judge' },
      { id: 'norm-1', cardId: 'SHD-005', name: 'Keeper', set: 'SHD', type: 'Unit', variantType: 'Normal' },
    ],
    metadata: {},
  }
  const out = fixCards(input.cards)
  const survivors = new Set(out.map((c: any) => c.id))

  if (survivors.has('wp-1') || survivors.has('pq-1') || survivors.has('ss-1')) {
    console.error('  ❌ An excluded promo variant leaked through'); return false
  }
  if (!survivors.has('norm-1')) { console.error('  ❌ Normal card was wrongly filtered'); return false }
  console.log('  ✓ Weekly Play / PQ / SS variants stay filtered; Normal kept')
  return true
}

/** Test 4 — idempotent: re-applying does not duplicate injected promos. */
function testIdempotent(): boolean {
  console.log('\n[Test 4] Injection is idempotent under re-application')
  const entry = CATALOG[0]
  const once = fixCards([sourceCardFor(entry)])
  // Feed the already-injected output back through (simulates runtime re-applying to built cards.json).
  const twice = fixCards(once)
  const count = twice.filter((c: any) => c.id === entry.id).length

  if (count !== 1) { console.error(`  ❌ Expected exactly 1 promo, got ${count}`); return false }
  console.log('  ✓ Re-applying keeps exactly one injected promo (no duplicates)')
  return true
}

/** Test 5 — a catalog entry whose source is absent is skipped, not fabricated. */
function testSkipsMissingSource(): boolean {
  console.log('\n[Test 5] Catalog entry with no resolvable source is skipped')
  const entry = CATALOG[0]
  const out = fixCards([{ id: 'unrelated', name: 'X', set: 'SOR', type: 'Unit', variantType: 'Normal' }])
  if (out.find((c: any) => c.id === entry.id)) { console.error('  ❌ Injected a promo with no source card'); return false }
  console.log('  ✓ No source → no injection (no fabricated cards)')
  return true
}

/** Test 6 — catalog integrity: resolved entries are well-formed. */
function testCatalogShape(): boolean {
  console.log('\n[Test 6] Catalog entries are well-formed')
  if (!Array.isArray(CATALOG) || CATALOG.length === 0) { console.error('  ❌ Empty catalog'); return false }
  const ids = new Set()
  for (const e of CATALOG) {
    if (!e.id?.startsWith('gc2026-')) { console.error(`  ❌ Bad id: ${e.id}`); return false }
    if (!e.sourceCardId) { console.error(`  ❌ ${e.id} missing sourceCardId`); return false }
    if (e.pool !== 'silver' && e.pool !== 'black') { console.error(`  ❌ ${e.id} bad pool: ${e.pool}`); return false }
    if (!e.placeholderImage?.startsWith('https://')) { console.error(`  ❌ ${e.id} bad placeholderImage`); return false }
    if (ids.has(e.id)) { console.error(`  ❌ Duplicate id: ${e.id}`); return false }
    ids.add(e.id)
  }
  console.log(`  ✓ ${CATALOG.length} catalog entries, unique gc2026- ids, silver/black pool, https placeholders`)
  return true
}

/** Test 7 — fall-over: a real GC printing (_OP_ art on the same cardId) wins over the placeholder. */
function testFallsOverToRealArt(): boolean {
  console.log('\n[Test 7] Auto-falls-over to real GC art when swuapi has it')
  const entry = CATALOG[0]
  const source = sourceCardFor(entry)
  const realArt = 'https://cdn.starwarsunlimited.com/card_00000000_EN_OP_real_gc_art.png'
  // A same-cardId sibling carrying the _OP_ GC marker — as swuapi would provide once uploaded.
  const realSibling = { ...source, id: 'real-op-sibling', variantType: 'Event Exclusive', imageUrl: realArt }

  const out = fixCards([source, realSibling])
  const promo = out.find((c: any) => c.id === entry.id)

  if (promo.imageUrl !== realArt) { console.error(`  ❌ Expected real art, got ${promo.imageUrl}`); return false }
  if (promo.gcPromo?.placeholder !== false) { console.error('  ❌ placeholder flag should be false once real art is used'); return false }
  console.log('  ✓ Uses real _OP_ art and clears the placeholder flag')
  return true
}

function runTests(): void {
  const tests = [
    testInjectsPromos,
    testSharesCardIdDistinctId,
    testOldPromosStillFiltered,
    testIdempotent,
    testSkipsMissingSource,
    testCatalogShape,
    testFallsOverToRealArt,
  ]
  let passed = 0, failed = 0
  for (const t of tests) {
    try { if (t()) passed++; else failed++ }
    catch (e) { console.error(`  ❌ threw: ${(e as Error).message}`); failed++ }
  }
  console.log('\n' + '='.repeat(60))
  console.log(`GC 2026 injection: ${passed} passed, ${failed} failed`)
  console.log('='.repeat(60))
  if (failed > 0) process.exit(1)
}

runTests()
