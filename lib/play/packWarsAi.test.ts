import { test } from 'node:test'
import assert from 'node:assert/strict'
import { packWarsAiHandlers, type PackWarsAiDeps } from './packWarsAi'
import { soloOpponentPath, soloRuntimeRules } from './soloEvent'
import { PtpPlayError } from '../../src/services/play/playState'
import { PackWarsUnsupportedError } from '../../src/services/play/packWarsDeck'
import type { Session } from '../auth'

const session = { id: 'user-1', exp: 2_000_000_000, is_alpha_tester: true } as unknown as Session
const context = (shareId = 'abc123') => ({ params: Promise.resolve({ shareId }) })
const post = (payload: unknown) => new Request('http://ptp.test/api/formats/pack-wars/abc123/ai', { method: 'POST', body: JSON.stringify(payload) })
function deps(overrides: Partial<PackWarsAiDeps> = {}) {
  const calls: { launch: unknown[][]; session: unknown[][] } = { launch: [], session: [] }
  const value: PackWarsAiDeps = {
    enabled: () => true,
    session: async (...args) => { calls.session.push(args); return session },
    launch: async (...args) => { calls.launch.push(args); return { launchUrl: 'https://play.example/launch?code=1', runId: 'run-1', expiresIn: 60 } },
    readiness: async () => ({ ready: true }),
    ...overrides,
  }
  return { value, calls }
}

test('the endpoint is a 404 while PTP_PACK_WARS_NATIVE_ENABLED is off, before any auth or input', async () => {
  const { value, calls } = deps({ enabled: () => false })
  const handlers = packWarsAiHandlers(value)
  for (const response of [await handlers.POST(post({ leaderId: 'l', baseId: 'b' }), context()), await handlers.GET(new Request('http://ptp.test/'), context())]) {
    assert.equal(response.status, 404)
    assert.equal((await response.json()).code, 'not_found')
  }
  assert.equal(calls.session.length, 0)
  assert.equal(calls.launch.length, 0)
})

test('auth and alpha refusals pass through with their status; POST asks for a mutation session', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [403, 'alpha_required']] as const) {
    const { value } = deps({ session: async () => { throw new PtpPlayError(status, code, 'No.') } })
    const response = await packWarsAiHandlers(value).POST(post({ leaderId: 'l', baseId: 'b' }), context())
    assert.equal(response.status, status)
    assert.deepEqual(await response.json(), { message: 'No.', code })
  }
  const { value, calls } = deps()
  await packWarsAiHandlers(value).POST(post({ leaderId: 'l', baseId: 'b' }), context())
  assert.equal(calls.session[0]![1], true, 'origin-checked mutation session')
})

test('POST {leaderId, baseId} starts a single game vs Leebo and returns the table url', async () => {
  const { value, calls } = deps()
  const requestId = '7f6b6d36-5b5c-4c39-9a51-0d0b4b3e2a11'
  const response = await packWarsAiHandlers(value).POST(post({ leaderId: 'leader-card', baseId: 'base-card', requestId }), context('pool-share'))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { url: 'https://play.example/launch?code=1', runId: 'run-1', requestId })
  const [userId, shareId, sentRequest, expiresAt, , options] = calls.launch[0]!
  assert.equal(userId, 'user-1'); assert.equal(shareId, 'pool-share'); assert.equal(sentRequest, requestId)
  assert.equal(expiresAt, 2_000_000_000_000)
  assert.deepEqual(options, { singleGame: true, packWars: { leaderId: 'leader-card', baseId: 'base-card' } })
  // Without a requestId each POST is a new game.
  await packWarsAiHandlers(value).POST(post({ leaderId: 'leader-card', baseId: 'base-card' }), context())
  await packWarsAiHandlers(value).POST(post({ leaderId: 'leader-card', baseId: 'base-card' }), context())
  assert.notEqual(calls.launch[1]![2], calls.launch[2]![2])
})

test('bad input is a 400 with a message, and never reaches the launcher', async () => {
  const { value, calls } = deps()
  for (const payload of [{}, { leaderId: 'l' }, { leaderId: '', baseId: 'b' }, { leaderId: 'l', baseId: 'b', requestId: 'nope' }, { leaderId: 'l', baseId: 'b', deck: [] }]) {
    const response = await packWarsAiHandlers(value).POST(post(payload), context())
    assert.equal(response.status, 400, JSON.stringify(payload))
    assert.equal(typeof (await response.json()).message, 'string')
  }
  assert.equal(calls.launch.length, 0)
})

test('refusals keep their status and message; unsupported cards are listed for the page', async () => {
  const unsupported = deps({ launch: async () => { throw new PackWarsUnsupportedError(['Mystery Card, Unprinted']) } })
  const response = await packWarsAiHandlers(unsupported.value).POST(post({ leaderId: 'l', baseId: 'b' }), context())
  assert.equal(response.status, 409)
  const json = await response.json()
  assert.equal(json.code, 'unsupported_cards'); assert.deepEqual(json.cards, ['Mystery Card, Unprinted']); assert.match(json.message, /Mystery Card/)
  const old = deps({ launch: async () => { throw new PtpPlayError(409, 'unverified_source', 'These packs were opened before…') } })
  assert.equal((await packWarsAiHandlers(old.value).POST(post({ leaderId: 'l', baseId: 'b' }), context())).status, 409)
  // Anything unexpected is a generic 503 that leaks nothing.
  const broken = deps({ launch: async () => { throw new Error('secret upstream detail') } })
  const failure = await packWarsAiHandlers(broken.value).POST(post({ leaderId: 'l', baseId: 'b' }), context())
  assert.equal(failure.status, 503)
  assert.doesNotMatch(JSON.stringify(await failure.json()), /secret/)
})

test('GET reports readiness for the signed-in owner', async () => {
  const seen: string[][] = []
  const { value } = deps({ readiness: async (userId, shareId) => { seen.push([userId, shareId]); return { ready: false, code: 'unverified_source', message: 'old' } } })
  const response = await packWarsAiHandlers(value).GET(new Request('http://ptp.test/'), context('pool-share'))
  assert.deepEqual(await response.json(), { ready: false, code: 'unverified_source', message: 'old' })
  assert.deepEqual(seen, [['user-1', 'pool-share']])
})

test('only Pack Wars runs send runtime format rules or change the opponent link', () => {
  const human = (poolType: string) => ({ human: { poolType } as never })
  assert.equal(soloRuntimeRules(human('draft')), undefined)
  assert.equal(soloRuntimeRules(human('sealed')), undefined)
  assert.deepEqual(soloRuntimeRules(human('pack_wars')), { minDeckSize: 1 })
  assert.equal(soloOpponentPath(human('sealed'), 'a b'), '/pools/a%20b/play/ai?chooseOpponent=1')
  assert.equal(soloOpponentPath(human('draft'), 'x'), '/pools/x/play/ai?chooseOpponent=1')
  assert.equal(soloOpponentPath(human('pack_wars'), 'x'), '/formats/pack-wars/x')
})
