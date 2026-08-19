// Seed sealed-deck stats.
//
// The /stats page aggregates over card_pools + built_decks. Against an empty
// database it correctly renders "No sealed data available", so every assertion
// about legends, stacked cells, card names and aspect icons has nothing to
// stand on — the whole of stats-page.spec.ts fails for want of data rather
// than for any defect.
//
// This inserts a handful of realistic sealed pools and the decks built from
// them, using real cards for the set so the tables have genuine names, aspects
// and rarities to render. Rows are tagged by pool name so cleanup removes
// exactly what was added and nothing else.

import { getPool } from './test-utils.ts'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

/** Marks the rows this file creates, so cleanup never touches anything else. */
export const STATS_SEED_TAG = 'e2e-stats-seed'

interface SeedCard {
  id: string
  cardId: string
  name: string
  type: string
  rarity: string
  aspects: string[]
  set: string
}

function loadCards(setCode: string): SeedCard[] {
  const raw = JSON.parse(readFileSync(join(projectRoot, 'src/data/cards.json'), 'utf8'))
  const all: SeedCard[] = Array.isArray(raw)
    ? raw
    : (raw.cards ?? Object.values(raw).find((v) => Array.isArray(v)) ?? [])
  return all.filter((c) => c && c.set === setCode)
}

/**
 * Insert `deckCount` sealed pools and the deck built from each.
 *
 * Leaders vary across decks so leader-selection stats have a distribution to
 * report rather than one card at 100%.
 */
export async function seedSealedStats(setCode = 'ASH', deckCount = 8): Promise<void> {
  const cards = loadCards(setCode)
  const leaders = cards.filter((c) => c.type === 'Leader')
  const bases = cards.filter((c) => c.type === 'Base')
  // Units and events carry the aspects and rarities the card tables display.
  const playable = cards.filter((c) => c.type !== 'Leader' && c.type !== 'Base')

  if (leaders.length === 0 || bases.length === 0 || playable.length < 30) {
    throw new Error(
      `seedSealedStats: not enough ${setCode} cards to build a deck ` +
      `(${leaders.length} leaders, ${bases.length} bases, ${playable.length} playable)`
    )
  }

  const db = getPool()

  for (let i = 0; i < deckCount; i++) {
    const leader = leaders[i % leaders.length]!
    const base = bases[i % bases.length]!
    // Offset the slice per deck so different cards appear at different rates,
    // which is what the inclusion and pick-rate columns are measuring.
    const start = (i * 7) % Math.max(1, playable.length - 40)
    const deck = playable.slice(start, start + 30)
    const sideboard = playable.slice(start + 30, start + 40)
    const poolCards = [leader, base, ...deck, ...sideboard]

    const pool = await db.query(
      // Backdated: the page's default range ends yesterday, and the query is
      // `built_at < (until::date + 1 day)`, so rows stamped now() fall outside
      // it and the page reports no data while the rows sit there unused.
      `INSERT INTO card_pools (share_id, set_code, cards, pool_type, name, created_at)
       VALUES ($1, $2, $3::jsonb, 'sealed', $4, now() - interval '3 days')
       RETURNING id`,
      [`${STATS_SEED_TAG}-${i}-${Date.now()}`, setCode, JSON.stringify(poolCards), STATS_SEED_TAG]
    )

    await db.query(
      `INSERT INTO built_decks (card_pool_id, set_code, pool_type, leader, base, deck, sideboard, built_at)
       VALUES ($1, $2, 'sealed', $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, now() - interval '3 days')`,
      [
        pool.rows[0].id,
        setCode,
        JSON.stringify(leader),
        JSON.stringify(base),
        JSON.stringify(deck),
        JSON.stringify(sideboard),
      ]
    )
  }
}

/** Remove only what seedSealedStats added (built_decks cascade with the pool). */
export async function cleanupSeededStats(): Promise<void> {
  const db = getPool()
  await db.query(`DELETE FROM card_pools WHERE name = $1`, [STATS_SEED_TAG])
}
