/**
 * Migration 033: Backfill draft_picks from existing JSONB data
 *
 * Reads drafted_cards and drafted_leaders from draft_pod_players,
 * and inserts corresponding rows into the new draft_picks table.
 *
 * Cards picked via the staged system have metadata (pickNumber, packNumber,
 * pickInPack, leaderRound). Older drafts without metadata use array position
 * as a fallback.
 *
 * SAFETY
 * ======
 * - Idempotent: Skips drafts that already have rows in draft_picks
 * - Non-destructive: Only inserts new records
 * - Handles missing metadata gracefully
 */

export async function run(client) {
  // Get all draft_pod_players with drafted cards or leaders
  const playersResult = await client.query(`
    SELECT
      dpp.id AS player_id,
      dpp.draft_pod_id,
      dpp.user_id,
      dpp.drafted_cards,
      dpp.drafted_leaders
    FROM draft_pod_players dpp
    JOIN draft_pods dp ON dp.id = dpp.draft_pod_id
    WHERE dp.status IN ('active', 'complete')
    ORDER BY dpp.draft_pod_id, dpp.id
  `)

  console.log(`   Found ${playersResult.rows.length} draft players to check`)

  let totalPlayersProcessed = 0
  let totalPlayersSkipped = 0
  let totalPicksInserted = 0

  for (const playerRow of playersResult.rows) {
    const { draft_pod_id, user_id, drafted_cards, drafted_leaders } = playerRow

    // Check if this draft already has picks backfilled
    const existingResult = await client.query(
      `SELECT COUNT(*) AS count FROM draft_picks WHERE draft_pod_id = $1 AND user_id = $2`,
      [draft_pod_id, user_id]
    )

    if (parseInt(existingResult.rows[0].count) > 0) {
      totalPlayersSkipped++
      continue
    }

    // Parse JSONB arrays
    let leaders, cards
    try {
      leaders = typeof drafted_leaders === 'string'
        ? JSON.parse(drafted_leaders)
        : drafted_leaders || []
      cards = typeof drafted_cards === 'string'
        ? JSON.parse(drafted_cards)
        : drafted_cards || []
    } catch {
      console.log(`   Player ${playerRow.player_id}: Invalid JSON, skipping`)
      totalPlayersSkipped++
      continue
    }

    if (leaders.length === 0 && cards.length === 0) {
      totalPlayersSkipped++
      continue
    }

    const records = []

    // Process drafted leaders
    for (let i = 0; i < leaders.length; i++) {
      const leader = leaders[i]
      if (!leader || !leader.id) continue

      const leaderRound = leader.leaderRound || (i + 1)
      const pickNumber = leader.pickNumber || (i + 1)

      records.push([
        draft_pod_id,
        user_id,
        leader.id,
        leader.name || 'Unknown',
        leader.set || 'UNK',
        leader.rarity || 'Unknown',
        leader.type || 'Leader',
        leader.variantType || 'Normal',
        true,  // is_leader
        0,     // pack_number (leaders don't have a pack)
        leaderRound,  // pick_in_pack = leader round for leaders
        pickNumber,
        leaderRound,
      ])
    }

    // Process drafted cards
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]
      if (!card || !card.id) continue

      // Use metadata if available, otherwise compute from position
      const packNumber = card.packNumber || (Math.floor(i / 14) + 1)
      const pickInPack = card.pickInPack || ((i % 14) + 1)
      const pickNumber = card.pickNumber || (leaders.length + i + 1)

      records.push([
        draft_pod_id,
        user_id,
        card.id,
        card.name || 'Unknown',
        card.set || 'UNK',
        card.rarity || 'Unknown',
        card.type || 'Unknown',
        card.variantType || 'Normal',
        false, // is_leader
        packNumber,
        pickInPack,
        pickNumber,
        null,  // leader_round
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
  }

  console.log(`   Summary: ${totalPlayersProcessed} players processed, ${totalPlayersSkipped} skipped`)
  console.log(`   Total: ${totalPicksInserted} picks inserted`)
}
