import { randomUUID } from 'node:crypto'
import { query, withTransaction } from '../../../../lib/db'
import { nativeConfig, revokeSessions } from './runtimeClient'
import { getMatch } from './privateMatches'

/** Persist first so process interruption or an unavailable gateway never loses revocation. */
export async function revokeNativeSubject(userId: string): Promise<void> {
  let config
  try { config = nativeConfig(process.env, true) } catch { return }
  const requestId = randomUUID()
  await query(`INSERT INTO ptp_native_session_revocations(subject,request_id) VALUES($1,$2)
    ON CONFLICT(subject) DO UPDATE SET request_id=$2,requested_at=NOW(),next_attempt_at=NOW()`, [userId, requestId])
  try {
    await revokeSessions(config, userId)
    await query('DELETE FROM ptp_native_session_revocations WHERE subject=$1 AND request_id=$2', [userId, requestId])
  } catch { /* Durable scheduler retries; gateway authorization also expires within six hours. */ }
}
let running = false
/** DB leases make polling safe across processes; failed work becomes due again after 30s. */
export async function reconcileNativePlay(): Promise<{ checked: number; failures: number }> {
  if (running) return { checked: 0, failures: 0 }
  let config
  try { config = nativeConfig(process.env, true) } catch { return { checked: 0, failures: 0 } }
  running = true
  let checked = 0, failures = 0
  try {
    const matches = await withTransaction(async tx => tx.queryRows(`UPDATE ptp_native_matches SET next_reconcile_at=NOW()+INTERVAL '30 seconds'
      WHERE id IN (SELECT id FROM ptp_native_matches WHERE status IN ('starting','active') AND next_reconcile_at<=NOW()
      ORDER BY next_reconcile_at LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING id,creator_user_id`))
    for (const match of matches) {
      try { await getMatch(String(match.id), String(match.creator_user_id)); checked++ } catch { failures++ }
    }
    const revoked = await withTransaction(async tx => tx.queryRows(`UPDATE ptp_native_session_revocations SET next_attempt_at=NOW()+INTERVAL '30 seconds'
      WHERE subject IN (SELECT subject FROM ptp_native_session_revocations WHERE next_attempt_at<=NOW()
      ORDER BY next_attempt_at LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING subject,request_id`))
    for (const row of revoked) {
      try {
        await revokeSessions(config, String(row.subject))
        await query('DELETE FROM ptp_native_session_revocations WHERE subject=$1 AND request_id=$2', [row.subject, row.request_id])
      } catch { failures++ }
    }
    return { checked, failures }
  } finally { running = false }
}
