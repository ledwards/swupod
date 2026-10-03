import { createHash, randomUUID } from 'node:crypto'
import { withTransaction } from '../../../../lib/db'
import { lockPlayAdmission } from './admission'
import { PtpPlayError } from '../playState'
import { nativeConfig } from './runtimeClient'
import { loadSupport } from './savedDeck'
export async function rematch(parentId: string, userId: string, accept?: boolean) {
  const config = nativeConfig()
  return withTransaction(async tx => {
    const seats = await tx.queryRows('SELECT s.*,v.snapshot FROM ptp_native_match_seats s JOIN ptp_play_deck_versions v ON v.id=s.deck_version_id WHERE s.match_id=$1 ORDER BY s.seat', [parentId])
    const own = seats.find(s => s.user_id === userId)
    if (!own || seats.length !== 2) throw new PtpPlayError(404, 'match_not_found', 'Match not found.')
    for (const id of seats.map(s => String(s.user_id)).sort()) await lockPlayAdmission(tx,id)
    const parent = await tx.queryRow('SELECT * FROM ptp_native_matches WHERE id=$1 FOR UPDATE', [parentId])
    if (parent?.status !== 'complete') throw new PtpPlayError(409,'match_not_complete','Finish the current game before requesting a rematch.')
    await tx.query('INSERT INTO ptp_native_rematches(parent_match_id) VALUES($1) ON CONFLICT DO NOTHING',[parentId])
    let state = await tx.queryRow('SELECT * FROM ptp_native_rematches WHERE parent_match_id=$1 FOR UPDATE',[parentId])
    if (!state) throw new Error('Rematch persistence failed')
    if (accept !== undefined && !state.new_match_id) {
      if (!accept) await tx.query('UPDATE ptp_native_rematches SET player0_consent=FALSE,player1_consent=FALSE,declined=TRUE WHERE parent_match_id=$1',[parentId])
      else {
        const column = Number(own.seat) === 0 ? 'player0_consent' : 'player1_consent'
        await tx.query(`UPDATE ptp_native_rematches SET ${column}=TRUE,declined=FALSE WHERE parent_match_id=$1`,[parentId])
      }
      state = await tx.queryRow('SELECT * FROM ptp_native_rematches WHERE parent_match_id=$1',[parentId])
    }
    if (!state) throw new Error('Rematch persistence failed')
    if (!state.new_match_id && state.player0_consent && state.player1_consent) {
      const support = await loadSupport(config.supportPath)
      for (const seat of seats) {
        const snapshot = typeof seat.snapshot === 'string' ? JSON.parse(seat.snapshot) : seat.snapshot as Record<string,unknown>
        if (snapshot.validationVersion !== support.policy.version) throw new PtpPlayError(409,'support_version_changed','Rebuild the decks for the current engine before playing again.')
        const busy = await tx.queryRow(`SELECT 1 FROM ptp_native_match_seats WHERE user_id=$1 AND released_at IS NULL
          UNION ALL SELECT 1 FROM ptp_play_queue_entries WHERE user_id=$1 AND status='queued' AND expires_at>NOW()
          UNION ALL SELECT 1 FROM ptp_play_matches WHERE (player1_user_id=$1 OR player2_user_id=$1) AND status IN ('matched','launch_ready','in_progress') LIMIT 1`,[seat.user_id])
        if (busy) throw new PtpPlayError(409,'already_playing','A player is already preparing or playing another game.')
      }
      const id = randomUUID()
      await tx.query("INSERT INTO ptp_native_matches(id,creator_user_id,request_id,invite_hash,allow_mismatch,status) VALUES($1,$2,$3,$4,$5,'starting')",[id,parent.creator_user_id,randomUUID(),createHash('sha256').update(randomUUID()).digest('hex'),parent.allow_mismatch])
      for (const seat of seats) await tx.query('INSERT INTO ptp_native_match_seats(match_id,seat,user_id,deck_version_id) VALUES($1,$2,$3,$4)',[id,seat.seat,seat.user_id,seat.deck_version_id])
      await tx.query('UPDATE ptp_native_rematches SET new_match_id=$2 WHERE parent_match_id=$1',[parentId,id])
      state.new_match_id = id
    }
    return { status: state.new_match_id ? 'ready' : state.declined ? 'declined' : 'waiting', accepted: [state.player0_consent,state.player1_consent],matchId: state.new_match_id ?? null }
  })
}
