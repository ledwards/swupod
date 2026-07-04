/**
 * Migration 024: Backfill draft card attribution
 *
 * THE BUG
 * =======
 * When drafts were started, ALL cards were tracked in card_generations with
 * the HOST's user_id, not the player who actually drafted them.
 *
 * THE FIX
 * =======
 * Query draft_pod_players.drafted_leaders and drafted_cards to find who
 * ACTUALLY drafted each card, then update card_generations.user_id accordingly.
 *
 * OPTIMIZED: Uses bulk fetches and in-memory processing instead of N+1 queries.
 *
 * SAFETY
 * ======
 * - Idempotent: Only updates records where user_id is wrong
 * - Non-destructive: Only changes user_id, preserves all other data
 * - Skips bots: Only processes players with user_id (not null)
 */

export async function run(client) {
  console.log('Starting draft card attribution backfill (optimized)...')

  // Step 1: Fetch all draft_pod_players with their drafted cards
  console.log('  Fetching all players...')
  const playersResult = await client.query(`
    SELECT
      dpp.id,
      dpp.draft_pod_id,
      dpp.user_id,
      dpp.drafted_leaders,
      dpp.drafted_cards,
      dp.share_id,
      dp.host_id
    FROM draft_pod_players dpp
    JOIN draft_pods dp ON dp.id = dpp.draft_pod_id
    WHERE dpp.user_id IS NOT NULL
  `)

  console.log(`  Found ${playersResult.rows.length} players`)

  // Step 2: Build a map of draft_pod_id -> { card_id -> user_id }
  // This tells us who drafted each card in each draft
  console.log('  Building card ownership map...')
  const draftCardOwnership = new Map() // draft_pod_id -> Map(card_id -> user_id)

  for (const player of playersResult.rows) {
    if (!draftCardOwnership.has(player.draft_pod_id)) {
      draftCardOwnership.set(player.draft_pod_id, new Map())
    }
    const cardMap = draftCardOwnership.get(player.draft_pod_id)

    // Parse drafted_leaders
    let draftedLeaders = []
    try {
      draftedLeaders = typeof player.drafted_leaders === 'string'
        ? JSON.parse(player.drafted_leaders)
        : player.drafted_leaders || []
    } catch { /* skip invalid JSON */ }

    // Parse drafted_cards
    let draftedCards = []
    try {
      draftedCards = typeof player.drafted_cards === 'string'
        ? JSON.parse(player.drafted_cards)
        : player.drafted_cards || []
    } catch { /* skip invalid JSON */ }

    // Map each card_id to the player who drafted it
    for (const card of [...draftedLeaders, ...draftedCards]) {
      if (card.id) {
        cardMap.set(card.id, player.user_id)
      }
    }
  }

  // Step 3: Fetch ALL draft card_generations that might need fixing
  console.log('  Fetching all draft card_generations...')
  const genResult = await client.query(`
    SELECT id, card_id, user_id, source_id
    FROM card_generations
    WHERE source_type = 'draft'
  `)

  console.log(`  Found ${genResult.rows.length} card_generation records`)

  // Step 4: Find records that need updating
  console.log('  Identifying records to fix...')
  const updates = []

  for (const gen of genResult.rows) {
    const cardMap = draftCardOwnership.get(gen.source_id)
    if (!cardMap) continue // Draft not in our player list

    const correctUserId = cardMap.get(gen.card_id)
    if (!correctUserId) continue // Card not found in any player's drafted cards

    // Check if update is needed
    if (gen.user_id !== correctUserId) {
      updates.push({ id: gen.id, user_id: correctUserId })
    }
  }

  console.log(`  Found ${updates.length} records to fix`)

  // Step 5: Apply updates in batches
  if (updates.length > 0) {
    console.log('  Applying updates...')
    const batchSize = 500
    let fixed = 0

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize)

      for (const update of batch) {
        await client.query(
          'UPDATE card_generations SET user_id = $1 WHERE id = $2',
          [update.user_id, update.id]
        )
        fixed++
      }

      if (i + batchSize < updates.length) {
        console.log(`    Progress: ${Math.min(i + batchSize, updates.length)}/${updates.length}`)
      }
    }

    console.log(`\nBackfill complete:`)
    console.log(`  Fixed: ${fixed} records`)
  } else {
    console.log(`\nBackfill complete: No records needed fixing`)
  }
}
