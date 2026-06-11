// @ts-nocheck
// Tests for the Discord OAuth callback's CSRF state verification and
// returnTo open-redirect hardening (U4, foundations hardening plan).
//
// The route is invoked directly with NextRequest objects; global.fetch is
// mocked so we can assert the Discord token exchange is NEVER attempted
// unless the double-submit state check passes. No DB needed (the mocked
// exchange fails before any user upsert).
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'

process.env.DISCORD_CLIENT_ID = 'test-client-id'
process.env.DISCORD_CLIENT_SECRET = 'test-client-secret'
process.env.APP_URL = 'http://localhost:3000'

const { NextRequest } = await import('next/server')
const { GET } = await import('./route')
const { OAUTH_STATE_COOKIE } = await import('../../signin/discord/route')

const APP_URL = 'http://localhost:3000'

function encodeState(data) {
  return Buffer.from(JSON.stringify(data)).toString('base64')
}

function callbackRequest({ code = 'auth-code', state, cookieNonce, error } = {}) {
  const url = new URL(`${APP_URL}/api/auth/callback/discord`)
  if (code) url.searchParams.set('code', code)
  if (state) url.searchParams.set('state', state)
  if (error) url.searchParams.set('error', error)
  const headers = {}
  if (cookieNonce) headers.cookie = `${OAUTH_STATE_COOKIE}=${cookieNonce}`
  return new NextRequest(url.toString(), { headers })
}

describe('GET /api/auth/callback/discord — OAuth state verification', () => {
  let fetchCalls
  const realFetch = global.fetch

  beforeEach(() => {
    fetchCalls = []
    global.fetch = async (...args) => {
      fetchCalls.push(args[0])
      // Fail the token exchange so the happy path stops before any DB write.
      return new Response('mocked failure', { status: 500 })
    }
  })

  afterEach(() => {
    global.fetch = realFetch
  })

  it('rejects when the state nonce does not match the cookie — no token exchange', async () => {
    const state = encodeState({ nonce: 'state-nonce', returnTo: '/draft/x' })
    const response = await GET(callbackRequest({ state, cookieNonce: 'different-nonce' }))

    assert.strictEqual(fetchCalls.length, 0, 'token exchange must not be attempted')
    assert.ok(response.headers.get('location').startsWith(`${APP_URL}/?error=invalid_oauth_state`))
  })

  it('rejects when the state cookie is missing entirely', async () => {
    const state = encodeState({ nonce: 'state-nonce', returnTo: '/' })
    const response = await GET(callbackRequest({ state }))

    assert.strictEqual(fetchCalls.length, 0)
    assert.ok(response.headers.get('location').includes('invalid_oauth_state'))
  })

  it('rejects when the state has no nonce (legacy/forged state)', async () => {
    const state = encodeState({ random: 'oldstyle', returnTo: '/' })
    const response = await GET(callbackRequest({ state, cookieNonce: 'whatever' }))

    assert.strictEqual(fetchCalls.length, 0)
    assert.ok(response.headers.get('location').includes('invalid_oauth_state'))
  })

  it('proceeds to the token exchange when nonce matches the cookie', async () => {
    const state = encodeState({ nonce: 'match-me', returnTo: '/' })
    await GET(callbackRequest({ state, cookieNonce: 'match-me' }))

    assert.strictEqual(fetchCalls.length, 1, 'token exchange attempted exactly once')
    assert.ok(String(fetchCalls[0]).includes('discord.com/api/oauth2/token'))
  })

  it('clears the state cookie on rejection', async () => {
    const state = encodeState({ nonce: 'a', returnTo: '/' })
    const response = await GET(callbackRequest({ state, cookieNonce: 'b' }))
    const setCookie = response.headers.get('set-cookie') || ''
    assert.ok(setCookie.includes(OAUTH_STATE_COOKIE), 'state cookie cleared')
  })

  describe('returnTo open-redirect hardening', () => {
    it('normalizes protocol-relative returnTo (//evil.com) to /', async () => {
      const state = encodeState({ nonce: 'n', returnTo: '//evil.com' })
      const response = await GET(callbackRequest({ state, error: 'access_denied', code: null }))
      const location = response.headers.get('location')
      assert.ok(
        location.startsWith(`${APP_URL}/?error=`),
        `redirect must stay on the app origin, got: ${location}`
      )
    })

    it('normalizes absolute returnTo (https://evil.com) to /', async () => {
      const state = encodeState({ nonce: 'n', returnTo: 'https://evil.com/phish' })
      const response = await GET(callbackRequest({ state, error: 'access_denied', code: null }))
      const location = response.headers.get('location')
      assert.ok(location.startsWith(`${APP_URL}/?error=`), `got: ${location}`)
    })

    it('keeps legitimate app-local returnTo paths', async () => {
      const state = encodeState({ nonce: 'n', returnTo: '/draft/abc' })
      const response = await GET(callbackRequest({ state, error: 'access_denied', code: null }))
      const location = response.headers.get('location')
      assert.ok(location.startsWith(`${APP_URL}/draft/abc?error=`), `got: ${location}`)
    })
  })
})
