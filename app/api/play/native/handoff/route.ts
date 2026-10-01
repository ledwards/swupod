import { getSession } from '@/lib/auth'
import { nativeSession, respond } from '@/src/services/play/native/http'
import { authorizeHandoff, nativeConfig } from '@/src/services/play/native/runtimeClient'
import { PtpPlayError } from '@/src/services/play/playState'
export async function GET(request: Request) {
  try {
    const config = nativeConfig(process.env, true)
    const handoff = new URL(request.url).searchParams.get('request')
    if (!handoff || !/^[a-f0-9]{64}$/.test(handoff)) throw new PtpPlayError(400, 'invalid_handoff', 'Invalid game handoff.')
    if (!getSession(request)) {
      const target = new URL('/api/auth/signin/discord', config.hostOrigin)
      target.searchParams.set('return_to', `/api/play/native/handoff?request=${handoff}`)
      return Response.redirect(target.href, 303)
    }
    const session = await nativeSession(request)
    const destination = await authorizeHandoff(config, session.id, handoff)
    return new Response(null, { status: 303, headers: { location: destination, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } })
  } catch (error) { return respond(async () => { throw error }) }
}
