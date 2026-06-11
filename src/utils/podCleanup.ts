/**
 * Pod cleanup helpers.
 *
 * deleteAbandonedPodRecords removes a pod and its dependent rows in ONE
 * transaction — a failure anywhere rolls back everything, so we can never
 * end up with orphaned pod_players or a pod stripped of its card_pools
 * (previously these were three separate autocommit DELETEs in server.ts).
 */

import { withTransaction } from '@/lib/db'

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
