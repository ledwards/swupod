/**
 * Sealed Pod Collation QA (Set 7+)
 *
 * A sealed pod deals packs cut from real 24-pack boxes at consecutive box
 * positions. A booster box is ALWAYS 24 packs — column depth 12 and the belt
 * boot length are both properties of the product, not parameters. Therefore:
 *
 *   **A player's pool statistics must not depend on how many players are in
 *   the pod.** Every seat, at every legal pod size, must land in the same
 *   real-data bands as a 6-pack window of a real box.
 *
 * RED before the fix (2026-08-13): the route dealt via
 * `generateSealedBox([], set, players * packsPerPlayer)`, stacking a 12/30/48-pack
 * array as if it were a box. A 5-player pod (n=30) put a belt boot seam inside
 * two seats' pools: seat 0 dup-identities 11.00 / 72.5% loaded and seat 2
 * 12.97 / 90.5% loaded, against spec bands 5.5-8.5 and 1-10%.
 *
 * Bands are the same real-data specs asserted in `lineStacking.test.ts`
 * (box 001, pool 002, LAW event fixtures; 6-box pair-gap refit 2026-07-11).
 *
 * Run with: npx tsx src/qa/sealedPodCollation.test.ts
 */

import { generateSealedPod, clearBeltCache } from '../utils/boosterPack'
import { initializeCardCache } from '../utils/cardCache'

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`\x1b[32m✅ ${name}\x1b[0m`)
    passed++
  } catch (e) {
    console.log(`\x1b[31m❌ ${name}\x1b[0m`)
    console.log(`\x1b[33m   ${(e as Error).message}\x1b[0m`)
    failed++
  }
}

function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new Error(message || 'Assertion failed')
}

const id = (c) => `${c.name}|${c.subtitle || ''}`
const isDeck = (c) => !c.isLeader && !c.isBase
const isNormal = (c) => (c.variantType || 'Normal') === 'Normal'
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length

// SPEC bands (real data — identical to lineStacking.test.ts). These calibrate
// SIX-pack pools; an 8-pack pool has 28 pairs vs 15, so the same numbers do not
// transfer and the 8-pack test asserts invariance instead of absolute values.
const DUP_MEAN_MIN = 5.5, DUP_MEAN_MAX = 8.5      // dup identities/pool, real ≈6.5
const LOADED_MIN = 0.01, LOADED_MAX = 0.10        // % pools ≥10 dup identities
const NN_MIN = 0.25, NN_MAX = 2.0                 // Normal+Normal pairs/pool
const SEAT_SPREAD_MAX = 1.5                       // max-min dup mean across all seats

// Legal casual pod sizes; Competitive Sealed is always 8 packs.
const POD_SIZES = [2, 3, 4, 5, 6, 8]
const TRIALS = 250

// Per-seat rates need more samples than per-seat means, so loaded/nn are asserted
// POOLED across a pod's seats (TRIALS x players pools) and the mean per seat.

type SeatStats = { dupMean: number; loaded: number; nnMean: number }

function seatStats(pools: unknown[][]): SeatStats {
  const dupIds: number[] = [], nn: number[] = []
  for (const packs of pools as { cards: unknown[] }[][]) {
    const byId: Record<string, unknown[]> = {}
    packs.forEach(pk => pk.cards.filter(isDeck).forEach(c => {
      (byId[id(c)] = byId[id(c)] || []).push(c)
    }))
    const dups = Object.values(byId).filter(x => x.length > 1)
    dupIds.push(dups.length)
    nn.push(dups.filter(x => x.length === 2 && x.every(isNormal)).length)
  }
  return {
    dupMean: mean(dupIds),
    loaded: dupIds.filter(x => x >= 10).length / dupIds.length,
    nnMean: mean(nn),
  }
}

/** Deal a pod exactly as the sealed pod route does, then split by seat. */
function dealPod(players: number, packsPerPlayer: number): SeatStats[] {
  const seats: unknown[][][] = Array.from({ length: players }, () => [])
  for (let t = 0; t < TRIALS; t++) {
    clearBeltCache()
    const all = generateSealedPod([], 'ASH', players * packsPerPlayer)
    for (let p = 0; p < players; p++) {
      seats[p]!.push(all.slice(p * packsPerPlayer, (p + 1) * packsPerPlayer))
    }
  }
  return seats.map(seatStats)
}

async function run() {
  await initializeCardCache()
  console.log('\x1b[1m\x1b[35m🎴 Sealed Pod Collation QA (Set 7+)\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(50) + '\x1b[0m')

  const bySize = new Map<number, SeatStats[]>()
  for (const players of POD_SIZES) bySize.set(players, dealPod(players, 6))

  for (const players of POD_SIZES) {
    const seats = bySize.get(players)!
    test(`SPEC: ${players}-player 6-pack pod — every seat in real-data bands (n=${players * 6})`, () => {
      const pooledLoaded = mean(seats.map(s => s.loaded))
      const pooledNn = mean(seats.map(s => s.nnMean))
      console.log(`\x1b[36m   seats dupIds ${seats.map(s => s.dupMean.toFixed(2)).join(' ')} | pooled loaded ${(pooledLoaded * 100).toFixed(1)}%  nn ${pooledNn.toFixed(2)}\x1b[0m`)

      seats.forEach((s, i) => {
        assert(s.dupMean >= DUP_MEAN_MIN && s.dupMean <= DUP_MEAN_MAX,
          `seat ${i}: dup identities/pool ${s.dupMean.toFixed(2)} outside band ${DUP_MEAN_MIN}-${DUP_MEAN_MAX}`)
      })
      assert(pooledLoaded >= LOADED_MIN && pooledLoaded <= LOADED_MAX,
        `loaded pool rate ${(pooledLoaded * 100).toFixed(1)}% outside band 1-10%`)
      assert(pooledNn >= NN_MIN && pooledNn <= NN_MAX,
        `nn-pairs/pool ${pooledNn.toFixed(2)} outside band ${NN_MIN}-${NN_MAX}`)
    })
  }

  test(`SPEC: no seat is advantaged — dup-identity spread across ALL 6-pack seats ≤ ${SEAT_SPREAD_MAX}`, () => {
    const all = [...bySize.values()].flat().map(s => s.dupMean)
    const spread = Math.max(...all) - Math.min(...all)
    console.log(`\x1b[36m   ${all.length} seats, dupIds/pool min ${Math.min(...all).toFixed(2)} max ${Math.max(...all).toFixed(2)}, spread ${spread.toFixed(2)}\x1b[0m`)
    assert(spread <= SEAT_SPREAD_MAX,
      `seat dup-identity spread ${spread.toFixed(2)} > ${SEAT_SPREAD_MAX} — pool quality depends on pod size/seat`)
  })

  // 8-pack pools have no real-data band (every transcribed real pool is 6-pack),
  // so these assert structure rather than an absolute level.
  //
  // Seat-to-seat spread is NOT flat for 8-pack pods and should not be forced to
  // be. Box positions 9-16 straddle the stacking column boundary (lines 7,5,3,1
  // then 24,22,20,18) and are genuinely duplicate-richer; box 1 is the only box
  // whose straddle seat looks clean, because clearBeltCache() resets the line
  // immediately before it. So a 3-box pod runs ~3.2-3.6 spread by construction.
  // Do NOT "fix" that by suppressing duplicates in later boxes.
  //
  // What IS assertable: pods that fit inside one box must be flat, and no seat
  // anywhere may exceed a gross ceiling. The invented-box bug produced 17.3-18.3
  // on the worst seats; the real range is 11.0-14.4.
  const EIGHT_PACK_CEILING = 16.0
  const SINGLE_BOX_SPREAD_MAX = 1.5

  test(`SPEC: 8-pack pods fitting inside one box are flat (spread ≤ ${SINGLE_BOX_SPREAD_MAX})`, () => {
    for (const players of [2, 3]) {  // 2x8=16, 3x8=24 — both inside one 24-pack box
      const m = dealPod(players, 8).map(s => s.dupMean)
      const spread = Math.max(...m) - Math.min(...m)
      console.log(`\x1b[36m   ${players}p x8 (single box): dupIds ${m.map(x => x.toFixed(1)).join(' ')}  spread ${spread.toFixed(2)}\x1b[0m`)
      assert(spread <= SINGLE_BOX_SPREAD_MAX,
        `${players}p 8-pack seat spread ${spread.toFixed(2)} > ${SINGLE_BOX_SPREAD_MAX} within a single box`)
    }
  })

  test(`SPEC: no 8-pack seat exceeds ${EIGHT_PACK_CEILING} dup identities (invented boxes produced 17-18)`, () => {
    for (const players of [4, 8]) {  // multi-box pods
      const m = dealPod(players, 8).map(s => s.dupMean)
      const worst = Math.max(...m)
      console.log(`\x1b[36m   ${players}p x8 (multi-box): dupIds ${m.map(x => x.toFixed(1)).join(' ')}  worst ${worst.toFixed(2)}\x1b[0m`)
      assert(worst <= EIGHT_PACK_CEILING,
        `${players}p 8-pack worst seat ${worst.toFixed(2)} > ${EIGHT_PACK_CEILING} — packs are not being cut from real 24-pack boxes`)
    }
  })

  console.log('')
  console.log('\x1b[36m============================\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  console.log(failed > 0 ? `\x1b[31m❌ Tests failed: ${failed}\x1b[0m` : `\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  if (failed > 0) process.exit(1)
}

run()
