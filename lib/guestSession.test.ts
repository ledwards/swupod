// Guest identity for signed-out solo drafting (lib/auth.ts).
// SPEC: a signed-out player can draft solo against bots. The guest token works
// only on the solo draft routes; it is never a session, never carries
// privileges, and only a private, casual, solo pod may be created with it.
import { describe, it } from 'node:test'
import assert from 'node:assert'

process.env['DATABASE_URL'] = process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'
const auth = await import('./auth.ts')
const { createGuestToken, verifyGuestToken, getGuestSession, getDraftSession, requireDraftSession, getSession, requireAuth, createToken, setGuestCookie, isGuestSoloDraftRequest, GUEST_COOKIE } = auth

const GUEST = '11111111-2222-4333-8444-555555555555'
const req = (cookie?: string, headers: Record<string, string> = {}) => new Request('http://localhost/api/draft', { headers: { ...(cookie ? { cookie } : {}), ...headers } })

describe('guest token', () => {
  it('round-trips the guest id', () => {
    assert.strictEqual(verifyGuestToken(createGuestToken(GUEST)), GUEST)
  })

  it('is never accepted as a session, by cookie or bearer header', () => {
    const token = createGuestToken(GUEST)
    assert.strictEqual(auth.verifyToken(token), null)
    assert.strictEqual(getSession(req(`swupod_session=${token}`)), null)
    assert.strictEqual(getSession(req(`ptp_session=${token}`)), null)
    assert.strictEqual(getSession(req(undefined, { authorization: `Bearer ${token}` })), null)
    assert.throws(() => requireAuth(req(`${GUEST_COOKIE}=${token}`)), /Unauthorized/)
  })

  it('a session token is not accepted as a guest token', () => {
    const session = createToken({ id: GUEST, email: 'a@b.c', username: 'real', is_admin: true })
    assert.strictEqual(verifyGuestToken(session), null)
    assert.strictEqual(getGuestSession(req(`${GUEST_COOKIE}=${session}`)), null)
  })

  it('rejects garbage', () => {
    assert.strictEqual(verifyGuestToken('nope'), null)
    assert.strictEqual(verifyGuestToken(undefined), null)
  })
})

describe('getDraftSession / requireDraftSession', () => {
  it('a guest acts as their guest user, with no privileges', () => {
    const session = getDraftSession(req(`${GUEST_COOKIE}=${createGuestToken(GUEST)}`))
    assert.ok(session)
    assert.strictEqual(session.id, GUEST)
    assert.strictEqual(session.is_guest, true)
    assert.strictEqual(session.is_admin, false)
    assert.strictEqual(session.is_alpha_tester, false)
    assert.strictEqual(session.is_beta_tester, false)
  })

  it('a signed-in player wins over a leftover guest cookie', () => {
    const real = createToken({ id: 'real-user', email: 'a@b.c', username: 'real' })
    const session = getDraftSession(req(`swupod_session=${real}; ${GUEST_COOKIE}=${createGuestToken(GUEST)}`))
    assert.strictEqual(session?.id, 'real-user')
    assert.notStrictEqual(session?.is_guest, true)
  })

  it('nobody at all is still unauthorized', () => {
    assert.strictEqual(getDraftSession(req()), null)
    assert.throws(() => requireDraftSession(req()), /Unauthorized/)
  })
})

describe('setGuestCookie', () => {
  it('sets an httpOnly guest cookie holding a guest token', () => {
    const response = setGuestCookie(new Response('{}'), GUEST)
    const cookie = response.headers.get('set-cookie') || ''
    assert.match(cookie, new RegExp(`^${GUEST_COOKIE}=`))
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /SameSite=Lax/)
    assert.strictEqual(verifyGuestToken(cookie.split(';')[0]!.slice(GUEST_COOKIE.length + 1)), GUEST)
  })
})

describe('isGuestSoloDraftRequest', () => {
  const solo = { setCode: 'SOR', isPublic: false, settings: { isSolo: true } }
  it('allows the private casual solo draft the /draft page sends', () => {
    assert.strictEqual(isGuestSoloDraftRequest(solo), true)
  })
  it('refuses every pod with other people, public pods, Competitive and Chaos', () => {
    assert.strictEqual(isGuestSoloDraftRequest({ setCode: 'SOR', isPublic: true, settings: { afterDraft: 'swiss', emptySeats: 'bots' } }), false)
    assert.strictEqual(isGuestSoloDraftRequest({ ...solo, settings: {} }), false)
    assert.strictEqual(isGuestSoloDraftRequest({ ...solo, isPublic: true }), false)
    assert.strictEqual(isGuestSoloDraftRequest({ setCode: 'SOR', settings: { isSolo: true } }), false)
    assert.strictEqual(isGuestSoloDraftRequest({ ...solo, settings: { isSolo: true, isPublic: true } }), false)
    assert.strictEqual(isGuestSoloDraftRequest({ ...solo, competitive: true }), false)
    assert.strictEqual(isGuestSoloDraftRequest({ ...solo, settings: { isSolo: true, draftMode: 'chaos', chaosSets: ['SOR'] } }), false)
    assert.strictEqual(isGuestSoloDraftRequest(null), false)
  })
})
