import { queryRow } from './db'

/** Resolve the default using the host's access; the stored choice covers every seat. */
export async function defaultDraftVoice(hostId: string): Promise<string | null> {
  const pack = await queryRow(`
    SELECT vp.id FROM voice_packs vp
    JOIN users u ON u.id=$1
    WHERE vp.code='LEEBO' AND vp.status='active'
      AND (u.is_admin=true OR u.is_patron=true OR EXISTS (
        SELECT 1 FROM voice_pack_entitlements e WHERE e.pack_id=vp.id AND e.user_id=u.id
      ))
    LIMIT 1`, [hostId])
  return pack ? String(pack.id) : null
}
