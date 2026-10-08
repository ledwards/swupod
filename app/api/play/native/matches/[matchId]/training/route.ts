import { queryRow } from '@/lib/db'
import { nativeSession, respond, uuid } from '@/src/services/play/native/http'
import { archiveNativeGame, trainingExamples, type GameRecord } from '@/src/services/play/native/gameRecords'
import { PtpPlayError } from '@/src/services/play/playState'
export function GET(request: Request, context: { params: Promise<{ matchId: string }> }) {
  return respond(async () => {
    const session = await nativeSession(request)
    const user = await queryRow('SELECT is_admin FROM users WHERE id=$1', [session.id])
    if (!user?.is_admin) throw new PtpPlayError(404, 'record_not_found', 'Game record not found.')
    const matchId = uuid((await context.params).matchId)
    await archiveNativeGame(matchId)
    const row = await queryRow('SELECT record_hash,record_json FROM ptp_native_game_records WHERE match_id=$1', [matchId])
    if (!row) throw new PtpPlayError(503, 'archive_pending', 'The game record is still being saved.')
    return { schemaVersion: 1, matchId, recordHash: row.record_hash, examples: trainingExamples(row.record_json as GameRecord, String(row.record_hash)) }
  })
}
