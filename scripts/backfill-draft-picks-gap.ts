/**
 * Backfill draft_picks gap (Feb 27 2026 – present)
 *
 * The application code had a bug where INSERT INTO draft_picks used
 * "pod_id" instead of "draft_pod_id", so no picks were recorded
 * after the initial backfill migration ran (~Feb 27).
 *
 * This script re-backfills from pod_players JSONB data for any
 * players that don't already have rows in draft_picks.
 *
 * Safe to run multiple times — skips players already backfilled.
 */

import pg from 'pg'

const DATABASE_URL = process.env['DATABASE_URL'] || process.env['DATABASE_PUBLIC_URL']
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : undefined,
})

async function main() {
  const client = await pool.connect()

  try {
    console.log('📊 Checking current state...')
    const before = await client.query('SELECT COUNT(*) as count FROM draft_picks')
    const latest = await client.query('SELECT MAX(picked_at) as latest FROM draft_picks')
    console.log(`   Current rows: ${before.rows[0].count}`)
    console.log(`   Latest pick:  ${latest.rows[0].latest}`)

    // Get all already-backfilled (pod_id, user_id) pairs in one query
    console.log('\n📥 Loading existing backfill state...')
    const existingResult = await client.query(
      `SELECT DISTINCT draft_pod_id, user_id FROM draft_picks`
    )
    const alreadyBackfilled = new Set(
      existingResult.rows.map(r => `${r.draft_pod_id}|${r.user_id}`)
    )
    console.log(`   ${alreadyBackfilled.size} player/pod pairs already backfilled`)

    console.log('\n📥 Finding players to backfill...')
    const playersResult = await client.query(`
      SELECT
        pp.id AS player_id,
        pp.pod_id,
        pp.user_id,
        pp.drafted_cards,
        pp.drafted_leaders
      FROM pod_players pp
      JOIN pods p ON p.id = pp.pod_id
      WHERE p.status IN ('active', 'complete')
        AND (pp.drafted_cards IS NOT NULL OR pp.drafted_leaders IS NOT NULL)
      ORDER BY pp.pod_id, pp.id
    `)

    console.log(`   Found ${playersResult.rows.length} draft players to check`)

    let totalPlayersProcessed = 0
    let totalPlayersSkipped = 0
    let totalPicksInserted = 0

    for (const playerRow of playersResult.rows) {
      const { pod_id, user_id, drafted_cards, drafted_leaders } = playerRow

      // Skip if already backfilled (in-memory check)
      if (alreadyBackfilled.has(`${pod_id}|${user_id}`)) {
        totalPlayersSkipped++
        continue
      }

      // Parse JSONB arrays
      let leaders: any[], cards: any[]
      try {
        leaders = typeof drafted_leaders === 'string'
          ? JSON.parse(drafted_leaders)
          : drafted_leaders || []
        cards = typeof drafted_cards === 'string'
          ? JSON.parse(drafted_cards)
          : drafted_cards || []
      } catch {
        totalPlayersSkipped++
        continue
      }

      if (leaders.length === 0 && cards.length === 0) {
        totalPlayersSkipped++
        continue
      }

      const records: any[][] = []

      // Process drafted leaders
      for (let i = 0; i < leaders.length; i++) {
        const leader = leaders[i]
        if (!leader || !leader.id) continue

        const leaderRound = leader.leaderRound || (i + 1)
        const pickNumber = leader.pickNumber || (i + 1)

        records.push([
          pod_id, user_id,
          leader.id, leader.name || 'Unknown',
          leader.set || 'UNK', leader.rarity || 'Unknown',
          leader.type || 'Leader', leader.variantType || 'Normal',
          true, 0, leaderRound, pickNumber, leaderRound,
        ])
      }

      // Process drafted cards
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]
        if (!card || !card.id) continue

        const packNumber = card.packNumber || (Math.floor(i / 14) + 1)
        const pickInPack = card.pickInPack || ((i % 14) + 1)
        const pickNumber = card.pickNumber || (leaders.length + i + 1)

        records.push([
          pod_id, user_id,
          card.id, card.name || 'Unknown',
          card.set || 'UNK', card.rarity || 'Unknown',
          card.type || 'Unknown', card.variantType || 'Normal',
          false, packNumber, pickInPack, pickNumber, null,
        ])
      }

      if (records.length === 0) {
        totalPlayersSkipped++
        continue
      }

      // Batch insert
      const BATCH_SIZE = 50
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE)
        const placeholders = batch.map((_, idx) => {
          const base = idx * 13
          return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9}, $${base+10}, $${base+11}, $${base+12}, $${base+13})`
        }).join(', ')

        const values = batch.flat()

        await client.query(
          `INSERT INTO draft_picks (
            draft_pod_id, user_id, card_id, card_name, set_code, rarity,
            card_type, variant_type, is_leader, pack_number, pick_in_pack,
            pick_number, leader_round
          ) VALUES ${placeholders}`,
          values
        )
      }

      totalPlayersProcessed++
      totalPicksInserted += records.length

      // Progress every 100 players
      if (totalPlayersProcessed % 100 === 0) {
        console.log(`   ... ${totalPlayersProcessed} players processed, ${totalPicksInserted} picks inserted`)
      }
    }

    const after = await client.query('SELECT COUNT(*) as count FROM draft_picks')
    const newLatest = await client.query('SELECT MAX(picked_at) as latest FROM draft_picks')

    console.log(`\n✅ Done!`)
    console.log(`   Players processed: ${totalPlayersProcessed}`)
    console.log(`   Players skipped:   ${totalPlayersSkipped} (already backfilled)`)
    console.log(`   Picks inserted:    ${totalPicksInserted}`)
    console.log(`   Total rows now:    ${after.rows[0].count} (was ${before.rows[0].count})`)
    console.log(`   Latest pick:       ${newLatest.rows[0].latest}`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
