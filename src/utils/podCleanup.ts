/**
 * Pod cleanup helpers.
 *
 * deleteAbandonedPodRecords removes a pod and its dependent rows in ONE
 * transaction — a failure anywhere rolls back everything, so we can never
 * end up with orphaned pod_players or a pod stripped of its card_pools
 * (previously these were three separate autocommit DELETEs in server.ts).
 *
 * cancelDraftPod is the whole "Cancel Draft" teardown — card attribution,
 * chat + Discord notices, deletion, and the 'deleted' broadcast. It is shared
 * by the host's DELETE /api/draft/:shareId and by the stalled-preview sweep, so
 * an automatic cancellation is byte-for-byte the same operation as the host's.
 */

import { query, queryRow, queryRows, withTransaction } from '@/lib/db'
import { markPodCancelled, deletePodMessage } from '@/lib/discordLfg'
import { broadcastDraftState, broadcastSystemChatMessage } from '@/src/lib/socketBroadcast'

/**
 * Delete a pod's card_pools, pod_players, and the pod row atomically.
 * Throws on failure (nothing is deleted in that case).
 *
 * @param podId - pods.id (uuid)
 */
export async function deleteAbandonedPodRecords(podId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.query('DELETE FROM card_pools WHERE pod_id = $1', [podId])
    await tx.query('DELETE FROM pod_players WHERE pod_id = $1', [podId])
    await tx.query('DELETE FROM pods WHERE id = $1', [podId])
  })
}

/**
 * Cancel a draft pod: the host's "Cancel Draft" teardown, in one place.
 *
 * 1. Re-attribute this draft's card_generations to the players who drafted
 *    them, so showcases survive the pod being deleted.
 * 2. Tell web chat.
 * 3. Resolve the Discord LFG message (delete it outright for a pod that never
 *    had 2 humans, otherwise mark the embed cancelled for history).
 * 4. Delete card_pools, pod_players and the pod.
 * 5. Broadcast — after the delete, so broadcastDraftState finds no pod and
 *    emits 'deleted', which is what kicks connected clients off the draft page
 *    (useDraftSocket → setDeleted). The host route used to fire this
 *    *before* deleting and not await it, so whether clients got 'deleted' or a
 *    final state snapshot came down to a race.
 *
 * @param podId - pods.id (uuid)
 * @param cancelledByUsername - Name for the Discord embed; the host, whether
 *                              they clicked Cancel themselves or not
 * @param chatMessage - System chat line announcing the cancellation
 * @returns false if the pod no longer exists, true if it was cancelled
 */
export async function cancelDraftPod(
  podId: string,
  cancelledByUsername: string,
  chatMessage: string
): Promise<boolean> {
  const pod = await queryRow(
    `SELECT id, share_id, set_code, set_name, name, max_players, current_players,
            pod_type, is_public, competitive
     FROM pods WHERE id = $1`,
    [podId]
  )
  if (!pod) return false

  const shareId = pod.share_id as string

  // BEFORE DELETING: fix card_generation attribution for any cards from this
  // draft, so showcases stay attributed to the right user afterwards.
  const players = await queryRows(
    `SELECT pp.user_id, pp.is_bot, pp.drafted_leaders, pp.drafted_cards, u.username
     FROM pod_players pp
     JOIN users u ON pp.user_id = u.id
     WHERE pp.pod_id = $1 AND pp.user_id IS NOT NULL`,
    [podId]
  )

  for (const player of players) {
    const cardIds: string[] = []

    try {
      const leaders = typeof player.drafted_leaders === 'string'
        ? JSON.parse(player.drafted_leaders)
        : player.drafted_leaders || []
      leaders.forEach((c: { id?: string }) => c.id && cardIds.push(c.id))
    } catch { /* skip invalid JSON */ }

    try {
      const cards = typeof player.drafted_cards === 'string'
        ? JSON.parse(player.drafted_cards)
        : player.drafted_cards || []
      cards.forEach((c: { id?: string }) => c.id && cardIds.push(c.id))
    } catch { /* skip invalid JSON */ }

    if (cardIds.length > 0) {
      await query(
        `UPDATE card_generations
         SET user_id = $1
         WHERE source_type = 'draft'
           AND source_share_id = $2
           AND card_id = ANY($3)
           AND user_id IS NULL`,
        [player.user_id, shareId, cardIds]
      )
    }
  }

  // Notify web chat before deleting
  broadcastSystemChatMessage(shareId, chatMessage)

  // Discord LFG: handle the message (must run before pod deletion).
  // Auto-decide: delete the message entirely if <2 humans (not a real
  // multiplayer pod), otherwise mark it cancelled with a red ❌ for history.
  const humanCount = players.filter(p => p.is_bot !== true).length
  const podInfo = {
    id: pod.id as string,
    share_id: shareId,
    set_code: pod.set_code as string,
    set_name: pod.set_name as string,
    name: pod.name as string | null,
    max_players: pod.max_players as number,
    current_players: pod.current_players as number,
    pod_type: (pod.pod_type as string) || 'draft',
    is_public: pod.is_public as boolean,
    competitive: pod.competitive === true,
  }

  if (humanCount < 2) {
    await deletePodMessage(podInfo).catch(() => {})
    await query(
      `UPDATE pods SET discord_message_id = NULL, discord_thread_id = NULL,
       discord_webhook_id = NULL, discord_webhook_token = NULL WHERE id = $1`,
      [podId]
    ).catch(() => {})
  } else {
    const playerNames = players.map(p => p.username as string)
    await markPodCancelled(podInfo, cancelledByUsername, playerNames).catch(() => {})
  }

  // Delete card_pools, pod_players and the pod — atomically
  await deleteAbandonedPodRecords(podId)

  // The pod is gone, so this emits 'deleted' to everyone in the room.
  await broadcastDraftState(shareId).catch(() => {})

  return true
}
