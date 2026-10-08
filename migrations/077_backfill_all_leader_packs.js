/**
 * Migration 077: Backfill pods.all_leader_packs for historical draft pods.
 *
 * BACKGROUND
 * ==========
 * Migration 076 added pods.all_leader_packs (per-seat snapshot of the 3 leaders
 * originally dealt to each seat, before the leader draft passes them around).
 * The draft start route now writes it live, but every draft completed before
 * that change has all_leader_packs = NULL.
 *
 * WHY WE CAN BACKFILL EXACTLY
 * ===========================
 * A leader draft deals `packsPerPlayer` leaders per seat (3 in a standard draft)
 * and runs exactly that many rounds, passing right. So every dealt leader is
 * eventually picked by SOME seat — there are no "never-picked" leaders. That
 * means the original per-seat packs are fully reconstructable from every seat's
 * drafted_leaders (each carries its leaderRound), by inverting the pass math.
 * reconstructOriginalLeaderPacks does exactly this.
 *
 * SAFETY / IDEMPOTENCY
 * ====================
 * - Only completed draft pods with all_leader_packs IS NULL are touched; the
 *   UPDATE re-checks IS NULL so re-running is a no-op.
 * - Reconstruction needs EVERY seat's picks (a leader dealt to one seat may be
 *   picked by any seat), so we load all pod_players including bots.
 * - We store a snapshot only when it validates: every drafted leader landed in
 *   exactly one original pack and no pack is empty. A pod that doesn't match the
 *   pass model (gaps in seats, partial/abandoned data) is skipped and logged,
 *   never stored with a wrong grouping.
 * - Per-pod work is isolated; one malformed pod can't abort the run.
 */
import { reconstructOriginalLeaderPacks } from '../src/utils/draftLogReconstruction.ts'

const PROGRESS_EVERY = 200

function safeParse(value) {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try { return JSON.parse(value) || [] } catch { return [] }
  }
  return value || []
}

export async function run(client) {
  console.log('   Backfill pods.all_leader_packs (opening-context for leader pick-order stats)')

  const podsRes = await client.query(`
    SELECT p.id
    FROM pods p
    WHERE p.pod_type = 'draft'
      AND p.status = 'complete'
      AND p.all_leader_packs IS NULL
    ORDER BY p.id
  `)
  console.log(`   ${podsRes.rows.length} completed draft pods to backfill`)

  let processed = 0
  let filled = 0
  let skippedNoLeaders = 0
  let skippedInconsistent = 0
  let errors = 0

  for (const { id: podId } of podsRes.rows) {
    processed++
    try {
      const playersRes = await client.query(
        `SELECT seat_number, drafted_leaders
         FROM pod_players
         WHERE pod_id = $1 AND seat_number IS NOT NULL AND seat_number >= 1
         ORDER BY seat_number`,
        [podId]
      )
      const rows = playersRes.rows
      const totalSeats = rows.length
      if (totalSeats < 2) { skippedNoLeaders++; continue }

      let totalDrafted = 0
      const players = rows.map(r => {
        const draftedLeaders = safeParse(r.drafted_leaders).map(l => ({
          ...l,
          instanceId: l.instanceId || l.id,
          leaderRound: l.leaderRound,
        }))
        totalDrafted += draftedLeaders.length
        return { seatNumber: r.seat_number, draftedLeaders, draftedCards: [] }
      })
      if (totalDrafted === 0) { skippedNoLeaders++; continue }

      // Every drafted leader must carry a round and an instanceId, or the pass
      // inversion can't place it. Bail on this pod rather than mis-group.
      const malformed = players.some(p =>
        p.draftedLeaders.some(l => !l.instanceId || !(l.leaderRound >= 1))
      )
      if (malformed) { skippedInconsistent++; continue }

      const originalLeaders = reconstructOriginalLeaderPacks(players, totalSeats)

      // Validate completeness before trusting the reconstruction: sum preserved
      // and no empty pack. Anything else means the pod doesn't fit the model.
      const reconstructedCount = originalLeaders.reduce((n, pack) => n + pack.length, 0)
      const anyEmpty = originalLeaders.some(pack => pack.length === 0)
      if (reconstructedCount !== totalDrafted || anyEmpty) { skippedInconsistent++; continue }

      await client.query(
        `UPDATE pods SET all_leader_packs = $1 WHERE id = $2 AND all_leader_packs IS NULL`,
        [JSON.stringify(originalLeaders), podId]
      )
      filled++
    } catch (err) {
      errors++
      console.warn(`     [warn] pod ${podId} skipped: ${err.message}`)
    }

    if (processed % PROGRESS_EVERY === 0) {
      console.log(`   Progress: ${processed}/${podsRes.rows.length} — ${filled} filled`)
    }
  }

  console.log('   ─────────────────────────────────────────')
  console.log(`   Pods processed:          ${processed}`)
  console.log(`   Filled:                  ${filled}`)
  console.log(`   Skipped (no leaders):    ${skippedNoLeaders}`)
  console.log(`   Skipped (inconsistent):  ${skippedInconsistent}`)
  console.log(`   Errors:                  ${errors}`)
  console.log('   ─────────────────────────────────────────')
}
