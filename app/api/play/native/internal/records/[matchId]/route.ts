import { queryRow } from '@/lib/db'
import { soloGameRecord } from '@/lib/play/soloRecords'
import { PtpPlayError } from '@/src/services/play/playState'
import { respond, uuid } from '@/src/services/play/native/http'
import { authorizeRecordService, memberGameRecord } from '@/src/services/play/native/gameRecords'
export function GET(request: Request, context: { params: Promise<{ matchId: string }> }) {
  return respond(async () => {
    authorizeRecordService(request)
    const id=uuid((await context.params).matchId),userId=uuid(new URL(request.url).searchParams.get('subject'))
    const solo=await queryRow('SELECT g.id FROM ptp_solo_ai_games g JOIN ptp_solo_ai_runs r ON r.id=g.run_id WHERE g.id=$1 AND r.owner_user_id=$2',[id,userId])
    if(solo){
      const user=await queryRow('SELECT is_admin,is_beta_tester FROM users WHERE id=$1',[userId])
      if(!user?.is_admin&&!user?.is_beta_tester)throw new PtpPlayError(403,'beta_required','Beta access required.')
      return (await soloGameRecord(id,userId)).record
    }
    const result = await memberGameRecord(id,userId)
    return result.record
  })
}
