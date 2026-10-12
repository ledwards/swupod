import { queryRow } from './db'
import { canSeeFullStats } from './auth'

/**
 * The draft review (the finished draft's slideshow page) is a Friends of the Pod
 * perk of the pod's host: it exists only when the host is a Friend of the Pod
 * (or an admin), the same entitlement the /stats cohorts use.
 */
export async function hostIsFriendOfThePod(hostId: string | null | undefined): Promise<boolean> {
  if (!hostId) return false
  const row = await queryRow('SELECT is_admin, is_patron FROM users WHERE id = $1', [hostId])
  return canSeeFullStats(row as { is_admin?: boolean; is_patron?: boolean } | null)
}

/** The host of a draft pod by share id, or null when there is no such draft. */
export async function draftPodHost(shareId: string): Promise<{ hostId: string | null } | null> {
  const row = await queryRow(`SELECT host_id FROM pods WHERE share_id = $1 AND pod_type = 'draft'`, [shareId])
  return row ? { hostId: (row as { host_id: string | null }).host_id } : null
}
