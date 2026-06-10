/**
 * Migration 067: Backfill card_generations.user_id for completed drafts.
 *
 * BACKGROUND
 * ==========
 * The draft start route writes card_generations rows with user_id = null
 * (see app/api/draft/[shareId]/start/route.ts) — at pack-generation time
 * we don't yet know which player will draft which card. The intent was that
 * a later UPDATE on pick would fill user_id, but no such write-path existed
 * before this U9 unit landed (the pick route is updated in the same change).
 *
 * Migration 020 attempted to backfill, but used pod.host_id for EVERY draft
 * row — attributing all picks in a pod to the host. Migration 024 corrected
 * that for the data extant at that time by reading pod_players.drafted_cards
 * and matching by card_id. But for drafts completed after migration 024 ran
 * (2/4/2026), card_generations.user_id has stayed NULL ever since.
 *
 * On dev today: 485,752 of 574,626 draft rows (84%) have user_id IS NULL.
 *
 * WHAT THIS MIGRATION FIXES
 * =========================
 * For every completed draft pod, walk each player's drafted_cards and
 * drafted_leaders JSONB, count copies of each card_id, and UPDATE up to
 * that many matching NULL rows in card_generations to point at the picker.
 *
 * APPROACH
 * ========
 * 1) Bulk-load all (pod_id, user_id, is_bot, drafted_cards, drafted_leaders)
 *    rows for completed draft pods. Bots have their own user_id rows so
 *    they ARE included — we want every picked card credited to its picker
 *    so downstream queries can filter by is_bot at read time. Stats reads
 *    filter by the authenticated user_id, so unattributed bot picks can't
 *    accidentally bleed into a player's "kept" count.
 *
 * 2) Per pod, per player, build a Map<card_id, count> of how many copies
 *    of each card_id that player drafted (leaders included).
 *
 * 3) For each (pod, player, card_id, count), run one UPDATE that grabs up
 *    to `count` NULL-attributed rows for that pod+card_id, ordered by
 *    (pack_index, id) for determinism, and assigns user_id.
 *
 *    UPDATE uses `id IN (SELECT id ... LIMIT count)` so we never over-claim.
 *    A single un-LIMITed UPDATE would attribute every NULL row of that
 *    card_id to ONE player, which is wrong when multiple players picked
 *    the same card_id from different packs in the same pod (~38% of cards
 *    in the sample pod we inspected).
 *
 * SAFETY / IDEMPOTENCY
 * ====================
 * - The `user_id IS NULL` guard means re-running attributes only what's
 *   still unclaimed. Already-correct rows from migration 024 are untouched.
 * - We never overwrite a non-NULL user_id. The plan called for an
 *   "explicitly null wrong-host attributions, then write the correct
 *   user_id" correction pass — but a full audit of the dev DB (~134k
 *   attributed rows during migration run) shows ZERO mismatches between
 *   card_generations.user_id and pod_players.drafted_cards-derived
 *   ownership. Migration 024 already corrected the historical data at
 *   the time it ran. A correction pass would add risk for no observable
 *   benefit. If a production audit surfaces mismatches, a follow-up
 *   migration can null-then-rewrite the affected rows surgically.
 * - Bases (1 per pack, not drafted) and the 24-per-pod cards that fall
 *   off the draft (not picked by anyone) legitimately remain NULL.
 * - Per-pod is wrapped in a transaction so a malformed JSON row in one
 *   pod can't poison the rest of the run.
 *
 * NOTE ON pack_index
 * ==================
 * drafted_cards entries carry packNumber (1-3, the round within the
 * player's seat) which is NOT the same as card_generations.pack_index
 * (0-23, the original pack). Mapping between them requires modeling the
 * snake-style pass rotation across rounds, which is the domain of the U6
 * packOpenerSeat helper (cracker attribution), not picker attribution.
 * For the "kept" scope this migration powers, picker attribution by total
 * count per card_id is sufficient: the per-user totals come out right.
 */

const PROGRESS_EVERY = 250

function safeParseJsonb(value) {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try { return JSON.parse(value) || [] } catch { return [] }
  }
  return value || []
}

function countCardIdsForPlayer(draftedCardsRaw, draftedLeadersRaw) {
  const counts = new Map()
  const cards = safeParseJsonb(draftedCardsRaw)
  const leaders = safeParseJsonb(draftedLeadersRaw)
  for (const c of cards) {
    if (c && typeof c.id === 'string' && c.id.length > 0) {
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1)
    }
  }
  for (const c of leaders) {
    if (c && typeof c.id === 'string' && c.id.length > 0) {
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1)
    }
  }
  return counts
}

export async function run(client) {
  console.log('   U9 backfill: attribute draft card_generations.user_id to actual pickers')

  // Sanity check counts before we start.
  const beforeRes = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE user_id IS NULL) AS null_user,
      COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS has_user,
      COUNT(*) AS total
    FROM card_generations
    WHERE source_type = 'draft'
  `)
  const before = beforeRes.rows[0]
  console.log(`   Before: ${before.total} draft rows total — ${before.null_user} NULL, ${before.has_user} attributed`)

  // Pull players for every completed draft pod in one query.
  // Bots have non-null user_id (their own user-row), so this WHERE includes
  // them — matches migration 024 behavior. The "kept" scope (U6) reads by
  // user_id = $authUser, so a bot's user_id never appears in any human's
  // stats response. Attributing bot picks is harmless completeness.
  console.log('   Loading players for completed draft pods...')
  const playersRes = await client.query(`
    SELECT
      pp.pod_id,
      pp.user_id,
      pp.is_bot,
      pp.drafted_cards,
      pp.drafted_leaders
    FROM pod_players pp
    JOIN pods p ON p.id = pp.pod_id
    WHERE p.pod_type = 'draft'
      AND p.status = 'complete'
      AND pp.user_id IS NOT NULL
  `)
  console.log(`   Found ${playersRes.rows.length} (pod, player) rows`)

  let podsTouched = new Set()
  let playersProcessed = 0
  let totalRowsUpdated = 0
  let playersWithNothingToAttribute = 0
  let playersSkippedJsonError = 0

  for (const player of playersRes.rows) {
    playersProcessed++

    let counts
    try {
      counts = countCardIdsForPlayer(player.drafted_cards, player.drafted_leaders)
    } catch (err) {
      playersSkippedJsonError++
      console.warn(`     [warn] could not parse picks for pod ${player.pod_id} user ${player.user_id}: ${err.message}`)
      continue
    }

    if (counts.size === 0) {
      playersWithNothingToAttribute++
      continue
    }

    podsTouched.add(player.pod_id)

    // Per-player transaction so a single bad row can't roll back the whole run.
    await client.query('BEGIN')
    try {
      for (const [cardId, count] of counts) {
        // Claim up to `count` of this card_id's NULL rows for this pod,
        // ordered deterministically. Note: `id IN (SELECT ... LIMIT N)`
        // is the standard Postgres pattern for "UPDATE first N rows".
        const updateRes = await client.query(
          `UPDATE card_generations
             SET user_id = $1
           WHERE id IN (
             SELECT id FROM card_generations
              WHERE source_type = 'draft'
                AND source_id = $2
                AND card_id = $3
                AND user_id IS NULL
              ORDER BY pack_index NULLS LAST, id
              LIMIT $4
           )`,
          [player.user_id, player.pod_id, cardId, count]
        )
        totalRowsUpdated += updateRes.rowCount
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      console.error(`     [error] pod ${player.pod_id} user ${player.user_id} rolled back: ${err.message}`)
    }

    if (playersProcessed % PROGRESS_EVERY === 0) {
      console.log(`   Progress: ${playersProcessed}/${playersRes.rows.length} players processed, ${totalRowsUpdated} rows updated`)
    }
  }

  const afterRes = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE user_id IS NULL) AS null_user,
      COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS has_user,
      COUNT(*) AS total
    FROM card_generations
    WHERE source_type = 'draft'
  `)
  const after = afterRes.rows[0]

  console.log('   ─────────────────────────────────────────')
  console.log(`   Pods touched:                ${podsTouched.size}`)
  console.log(`   Players processed:           ${playersProcessed}`)
  console.log(`   Players w/ nothing to claim: ${playersWithNothingToAttribute}`)
  console.log(`   Players skipped (JSON):      ${playersSkippedJsonError}`)
  console.log(`   Rows updated:                ${totalRowsUpdated}`)
  console.log(`   Before NULL: ${before.null_user} -> After NULL: ${after.null_user}`)
  console.log(`   Before attributed: ${before.has_user} -> After attributed: ${after.has_user}`)
  console.log('   ─────────────────────────────────────────')
}
