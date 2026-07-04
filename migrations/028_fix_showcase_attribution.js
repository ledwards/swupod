/**
 * Migration 028: Fix showcase leader attribution
 *
 * PROBLEMS BEING FIXED:
 * ====================
 * 1. Sealed showcases have NULL user_id (migration 024 only handled drafts)
 * 2. Some draft showcases have wrong or NULL user_id (migration 024 had bugs)
 *
 * APPROACH:
 * =========
 * Part 1 - Sealed: Single UPDATE with JOIN (fast)
 * Part 2 - Drafts: Bulk fetch all data, process in memory, batch update (fast)
 *
 * SAFETY:
 * =======
 * - Idempotent: Only updates records where user_id is NULL or incorrect
 * - Non-destructive: Only changes user_id, preserves all other data
 * - Logs all changes for audit trail
 */

export async function run(client) {
  console.log('Starting showcase attribution fix...\n')

  let sealedFixed = 0
  let draftFixed = 0
  let wrongFixed = 0
  let errors = []

  // ============================================
  // PART 1: Fix sealed showcase attribution
  // ============================================
  console.log('Part 1: Fixing sealed showcases...')

  const sealedResult = await client.query(`
    UPDATE card_generations cg
    SET user_id = cp.user_id
    FROM card_pools cp
    WHERE cg.source_type = 'sealed'
      AND cg.source_share_id = cp.share_id
      AND cg.user_id IS NULL
      AND cp.user_id IS NOT NULL
    RETURNING cg.id, cg.card_name, cg.source_share_id, cp.user_id
  `)

  sealedFixed = sealedResult.rowCount
  console.log(`  Fixed ${sealedFixed} sealed showcase(s)`)
  sealedResult.rows.forEach(row => {
    console.log(`    - ${row.card_name} (pool ${row.source_share_id}) -> user ${row.user_id}`)
  })

  // ============================================
  // PART 2 & 3: Fix draft showcase attribution (bulk approach)
  // ============================================
  console.log('\nPart 2: Fixing draft showcases (bulk fetch)...')

  // Fetch ALL draft showcases that might need fixing (NULL or host-attributed)
  const draftShowcasesResult = await client.query(`
    SELECT
      cg.id,
      cg.card_id,
      cg.card_name,
      cg.user_id as current_user_id,
      cg.source_share_id,
      dp.id as draft_pod_id,
      dp.host_id
    FROM card_generations cg
    JOIN draft_pods dp ON dp.share_id = cg.source_share_id
    WHERE cg.source_type = 'draft'
      AND cg.treatment = 'showcase'
      AND (cg.user_id IS NULL OR cg.user_id = dp.host_id)
  `)

  if (draftShowcasesResult.rows.length === 0) {
    console.log('  No draft showcases need fixing')
  } else {
    console.log(`  Found ${draftShowcasesResult.rows.length} draft showcase(s) to check`)

    // Get unique draft_pod_ids
    const draftPodIds = [...new Set(draftShowcasesResult.rows.map(r => r.draft_pod_id))]
    console.log(`  Fetching player data for ${draftPodIds.length} draft(s)...`)

    // Bulk fetch ALL players for these drafts in ONE query
    const playersResult = await client.query(`
      SELECT
        draft_pod_id,
        user_id,
        drafted_leaders,
        drafted_cards
      FROM draft_pod_players
      WHERE draft_pod_id = ANY($1)
        AND user_id IS NOT NULL
    `, [draftPodIds])

    // Build a lookup: draft_pod_id -> array of {user_id, card_ids}
    const draftPlayersMap = new Map()
    for (const player of playersResult.rows) {
      if (!draftPlayersMap.has(player.draft_pod_id)) {
        draftPlayersMap.set(player.draft_pod_id, [])
      }

      // Parse and extract card IDs
      let cardIds = new Set()
      try {
        const leaders = typeof player.drafted_leaders === 'string'
          ? JSON.parse(player.drafted_leaders)
          : player.drafted_leaders || []
        leaders.forEach(c => c.id && cardIds.add(c.id))
      } catch { /* skip */ }

      try {
        const cards = typeof player.drafted_cards === 'string'
          ? JSON.parse(player.drafted_cards)
          : player.drafted_cards || []
        cards.forEach(c => c.id && cardIds.add(c.id))
      } catch { /* skip */ }

      draftPlayersMap.get(player.draft_pod_id).push({
        user_id: player.user_id,
        cardIds
      })
    }

    // Process each showcase and collect updates
    const updates = []
    for (const showcase of draftShowcasesResult.rows) {
      const players = draftPlayersMap.get(showcase.draft_pod_id) || []

      // Find who actually has this card
      let realOwner = null
      for (const player of players) {
        if (player.cardIds.has(showcase.card_id)) {
          realOwner = player.user_id
          break
        }
      }

      if (!realOwner) {
        errors.push(`Could not find owner for ${showcase.card_name} in draft ${showcase.source_share_id}`)
        console.log(`    - ${showcase.card_name} (draft ${showcase.source_share_id}) -> NOT FOUND`)
        continue
      }

      // Check if update is needed
      if (showcase.current_user_id === null) {
        updates.push({ id: showcase.id, user_id: realOwner })
        draftFixed++
        console.log(`    - ${showcase.card_name} (draft ${showcase.source_share_id}) -> ${realOwner}`)
      } else if (showcase.current_user_id !== realOwner) {
        updates.push({ id: showcase.id, user_id: realOwner })
        wrongFixed++
        console.log(`    - ${showcase.card_name} (draft ${showcase.source_share_id}) -> FIXED: ${showcase.current_user_id} -> ${realOwner}`)
      } else {
        console.log(`    - ${showcase.card_name} (draft ${showcase.source_share_id}) -> already correct`)
      }
    }

    // Batch update all at once
    if (updates.length > 0) {
      console.log(`\n  Applying ${updates.length} update(s)...`)
      for (const update of updates) {
        await client.query(
          'UPDATE card_generations SET user_id = $1 WHERE id = $2',
          [update.user_id, update.id]
        )
      }
    }
  }

  // ============================================
  // Summary
  // ============================================
  console.log('\n========================================')
  console.log('MIGRATION COMPLETE')
  console.log('========================================')
  console.log(`  Sealed showcases fixed:        ${sealedFixed}`)
  console.log(`  Draft showcases fixed (NULL):  ${draftFixed}`)
  console.log(`  Draft showcases fixed (wrong): ${wrongFixed}`)
  console.log(`  Total fixed:                   ${sealedFixed + draftFixed + wrongFixed}`)

  if (errors.length > 0) {
    console.log(`\n  Warnings/Errors (${errors.length}):`)
    errors.forEach(e => console.log(`    - ${e}`))
  }

  console.log('')
}
