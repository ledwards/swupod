import { getSession } from '../../../../lib/auth'
import { queryRow } from '../../../../lib/db'
import { PtpPlayError } from '../playState'
import { NativeDeckEligibilityError } from '../deckVersions'
import { nativeConfig } from './runtimeClient'
export async function nativeSession(request: Request, mutation = false) {
  const config = nativeConfig(process.env, true)
  if (mutation && request.headers.get('origin') !== config.hostOrigin) throw new PtpPlayError(403, 'invalid_origin', 'Request origin is not allowed.')
  const session = getSession(request)
  if (!session) throw new PtpPlayError(401, 'unauthorized', 'Sign in to play.')
  const user = await queryRow('SELECT auth_version,is_admin,is_alpha_tester FROM users WHERE id=$1', [session.id])
  if (!user || user.auth_version !== session.auth_version) throw new PtpPlayError(401, 'session_expired', 'Sign in again to play.')
  if (!user.is_admin && !user.is_alpha_tester) throw new PtpPlayError(403, 'alpha_required', 'Native play is available to alpha testers only.')
  return session
}
export function text(value: unknown, name: string) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200) throw new PtpPlayError(400, 'invalid_input', `${name} is required.`)
  return value
}
export function uuid(value: unknown) {
  const id = text(value, 'ID')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new PtpPlayError(400, 'invalid_input', 'A valid ID is required.')
  return id
}
export async function body(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader()
  if (!reader) throw new PtpPlayError(400, 'invalid_input', 'Request body is required.')
  const chunks: Uint8Array[] = []; let length = 0
  while (true) {
    const next = await reader.read(); if (next.done) break
    length += next.value.byteLength
    if (length > maxBytes) { await reader.cancel(); throw new PtpPlayError(413, 'body_too_large', 'Request is too large.') }
    chunks.push(next.value)
  }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value }
  catch { throw new PtpPlayError(400, 'invalid_input', 'Invalid JSON object.') }
}
export async function respond(action: () => Promise<unknown>): Promise<Response> {
  try { return Response.json(await action(), { headers: { 'cache-control': 'no-store' } }) }
  catch (error) {
    if (error instanceof PtpPlayError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { 'cache-control': 'no-store' } })
    if (error instanceof NativeDeckEligibilityError) return Response.json({ error: error.message, code: error.code }, { status: 409 })
    // No upstream responses, credentials or deck payloads in client errors/logs.
    return Response.json({ error: 'Native play is temporarily unavailable. Retry safely.', code: 'native_unavailable' }, { status: 503 })
  }
}
