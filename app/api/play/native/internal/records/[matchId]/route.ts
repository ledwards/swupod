import { respond, uuid } from '@/src/services/play/native/http'
import { authorizeRecordService, memberGameRecord } from '@/src/services/play/native/gameRecords'
export function GET(request: Request, context: { params: Promise<{ matchId: string }> }) {
  return respond(async () => {
    authorizeRecordService(request)
    const result = await memberGameRecord(uuid((await context.params).matchId), uuid(new URL(request.url).searchParams.get('subject')))
    return result.record
  })
}
