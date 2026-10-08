import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

// Env vars are read at module load, so set them before importing.
process.env['DISCORD_BOT_TOKEN'] = 'test-bot-token'
process.env['DISCORD_GUILD_ID'] = 'test-guild-id'

const { isGuildMember } = await import('./discord.ts')

// Prod deploy logs were dominated by `isGuildMember: Discord API error 404
// {"code": 10007}` — a 404 "Unknown Member" just means the user isn't in
// the guild, which is an expected negative result, not an error. These
// tests pin that 404 stays quiet while real API failures still log.
describe('isGuildMember', () => {
  const realFetch = globalThis.fetch
  const realConsoleError = console.error
  let errorLogs: unknown[][] = []

  beforeEach(() => {
    errorLogs = []
    console.error = (...args: unknown[]) => {
      errorLogs.push(args)
    }
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    console.error = realConsoleError
  })

  function stubFetch(status: number, body: unknown): void {
    globalThis.fetch = async () =>
      new Response(JSON.stringify(body), { status })
  }

  it('returns true for a guild member without logging errors', async () => {
    stubFetch(200, { roles: [] })

    assert.equal(await isGuildMember('user-in-guild'), true)
    assert.equal(errorLogs.length, 0)
  })

  it('FIXED: 404 Unknown Member returns false without logging an error', async () => {
    stubFetch(404, { message: 'Unknown Member', code: 10007 })

    assert.equal(await isGuildMember('user-not-in-guild'), false)
    assert.equal(
      errorLogs.length,
      0,
      `SPEC: 404 is an expected "not in guild" result and must not log errors, got: ${JSON.stringify(errorLogs)}`
    )
  })

  it('still logs console.error for unexpected statuses (401)', async () => {
    stubFetch(401, { message: 'Unauthorized', code: 0 })

    assert.equal(await isGuildMember('any-user'), false)
    assert.equal(errorLogs.length, 1)
  })

  it('still logs console.error for unexpected statuses (500)', async () => {
    stubFetch(500, { message: 'Internal Server Error', code: 0 })

    assert.equal(await isGuildMember('any-user'), false)
    assert.equal(errorLogs.length, 1)
  })

  it('returns false and logs on network errors', async () => {
    globalThis.fetch = async () => {
      throw new Error('network down')
    }

    assert.equal(await isGuildMember('any-user'), false)
    assert.equal(errorLogs.length, 1)
  })
})
