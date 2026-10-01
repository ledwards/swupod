import type { TxClient } from '../../../../lib/db'
import { PtpPlayError } from '../playState'
/** Shared by legacy queue entry and native reservations; survives processes/tabs. */
export async function lockPlayAdmission(tx: TxClient, userId: string): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [`ptp-play-user:${userId}`])
}
export async function rejectNativeReservation(tx: TxClient, userId: string): Promise<void> {
  const active = await tx.queryRow('SELECT match_id FROM ptp_native_match_seats WHERE user_id=$1 AND released_at IS NULL LIMIT 1', [userId])
  if (active) throw new PtpPlayError(409, 'already_playing', 'Resume or cancel your native private game before entering this queue.')
}
