/**
 * Migration 023: Normalize pack format to object structure
 *
 * BACKGROUND
 * ==========
 * Due to an inconsistency introduced during development, packs were stored
 * in two different formats:
 *
 * - Sealed pools: { cards: [...] } (object format) ✓
 * - Draft pods: [...] (raw array format) ✗
 *
 * The canonical format should be { cards: [...] } everywhere because:
 * 1. It's what generateBoosterPack() returns
 * 2. It's extensible (can add metadata like packNumber, openedAt)
 * 3. It's self-documenting
 *
 * WHAT THIS MIGRATION FIXES
 * =========================
 * - Converts draft_pods.all_packs from [[...], ...] to [{cards: [...]}, ...]
 * - Sealed pools already use correct format, no change needed
 *
 * Note: current_pack in draft_pod_players stores just the cards array
 * (extracted from the pack object), which is intentional - it represents
 * "the cards I'm currently picking from", not the full pack structure.
 *
 * SAFETY
 * ======
 * - Idempotent: Detects and skips packs already in object format
 * - Non-destructive: Only converts format, preserves all card data
 */

/**
 * Main migration function
 */
export async function run(client) {
  // Get all draft pods with all_packs data
  const podsResult = await client.query(
    'SELECT id, all_packs FROM draft_pods WHERE all_packs IS NOT NULL'
  )

  console.log(`   Found ${podsResult.rows.length} draft pods to check`)

  let podsConverted = 0
  let packsConverted = 0

  for (const row of podsResult.rows) {
    let allPacks = typeof row.all_packs === 'string'
      ? JSON.parse(row.all_packs)
      : row.all_packs

    if (!Array.isArray(allPacks)) continue

    let needsUpdate = false
    let podPacksConverted = 0

    // allPacks structure: [player][pack]
    allPacks = allPacks.map(playerPacks => {
      if (!Array.isArray(playerPacks)) return playerPacks

      return playerPacks.map(pack => {
        // Already in object format
        if (pack && typeof pack === 'object' && !Array.isArray(pack) && pack.cards) {
          return pack
        }

        // Convert array to object format
        if (Array.isArray(pack)) {
          needsUpdate = true
          podPacksConverted++
          return { cards: pack }
        }

        return pack
      })
    })

    if (needsUpdate) {
      await client.query(
        'UPDATE draft_pods SET all_packs = $1 WHERE id = $2',
        [JSON.stringify(allPacks), row.id]
      )
      podsConverted++
      packsConverted += podPacksConverted
    }
  }

  console.log(`   Summary: ${podsConverted} pods updated, ${packsConverted} packs converted`)
}
