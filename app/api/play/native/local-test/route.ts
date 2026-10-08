import { requireAlphaAccess } from '@/lib/auth'
import { PtpPlayError } from '@/src/services/play/playState'
import { body, nativeSession, respond, text, uuid } from '@/src/services/play/native/http'
import { launchLocalPractice } from '@/src/services/play/native/localPractice'
export function POST(request: Request) {
  return respond(async () => {
    const session = await nativeSession(request, true)
    const input = await body(request)
    const opponent = input.opponent ?? 'human'
    if (opponent !== 'human' && opponent !== 'ai') throw new PtpPlayError(400, 'invalid_opponent', 'Choose a human or AI opponent.')
    if (opponent === 'ai') {
      try { await requireAlphaAccess(request) }
      catch { throw new PtpPlayError(403, 'alpha_required', 'AI play is available to alpha testers only.') }
    }
    return launchLocalPractice(session.id, text(input.poolShareId, 'Deck'), uuid(input.requestId), Number(input.seat), (session.exp ?? 0) * 1000, opponent)
  })
}
