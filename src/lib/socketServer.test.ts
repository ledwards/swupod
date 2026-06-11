// Tests for Socket.io authentication + identity rules (U3, foundations
// hardening). Runs a real Socket.io server on an ephemeral port with stubbed
// Discord/delist deps — no DB needed.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'

// Pin the JWT secret BEFORE lib/auth reads it at module init.
process.env['JWT_SECRET'] = 'socket-test-secret'

const { Server } = await import('socket.io')
const { io: ioClient } = await import('socket.io-client')
const { createToken } = await import('@/lib/auth')
const { setupSocketServer, buildAllowedOrigins, makeAllowRequest } = await import('./socketServer')

type ClientSocket = ReturnType<typeof ioClient>

const realUser = {
  id: 'user-real-1',
  email: 'real@example.test',
  username: 'RealUser',
  avatar_url: 'https://cdn.example.test/real.png',
}
const otherUser = {
  id: 'user-real-2',
  email: 'other@example.test',
  username: 'OtherUser',
  avatar_url: null,
}

describe('buildAllowedOrigins', () => {
  it('includes configured app origins plus www/bare variants', () => {
    const origins = buildAllowedOrigins(
      { APP_URL: 'https://www.protectthepod.com' } as NodeJS.ProcessEnv,
      false
    )
    assert.ok(origins.includes('https://www.protectthepod.com'))
    assert.ok(origins.includes('https://protectthepod.com'))
    assert.ok(!origins.includes('*'))
  })

  it('adds localhost origins only in dev', () => {
    const prod = buildAllowedOrigins({ APP_URL: 'https://example.com' } as NodeJS.ProcessEnv, false)
    const dev = buildAllowedOrigins({ APP_URL: 'http://localhost:3000' } as NodeJS.ProcessEnv, true)
    assert.ok(!prod.includes('http://localhost:3000'))
    assert.ok(dev.includes('http://localhost:3000'))
  })

  it('ignores malformed URLs', () => {
    const origins = buildAllowedOrigins({ APP_URL: 'not a url' } as NodeJS.ProcessEnv, false)
    assert.deepStrictEqual(origins, [])
  })
})

describe('socket server auth', () => {
  let httpServer: HttpServer
  let io: InstanceType<typeof Server>
  let port: number
  let state: ReturnType<typeof setupSocketServer>
  const podMessages: Array<{ shareId: string; username: string; avatarUrl: string | null; text: string }> = []
  const lobbyMessages: Array<{ lobbyType: string; username: string }> = []
  const openClients: ClientSocket[] = []

  const ALLOWED_ORIGIN = 'http://localhost:3000'

  function connect(opts: { token?: string; origin?: string } = {}): ClientSocket {
    const headers: Record<string, string> = {}
    if (opts.token) headers['cookie'] = `swupod_session=${opts.token}`
    if (opts.origin) headers['origin'] = opts.origin
    const client = ioClient(`http://localhost:${port}`, {
      transports: ['polling', 'websocket'],
      extraHeaders: headers,
      reconnection: false,
      timeout: 3000,
    })
    openClients.push(client)
    return client
  }

  function connected(client: ClientSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      client.on('connect', () => resolve())
      client.on('connect_error', (err: Error) => reject(err))
    })
  }

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  before(async () => {
    httpServer = createServer()
    io = new Server(httpServer, {
      cors: { origin: [ALLOWED_ORIGIN], credentials: true },
      allowRequest: makeAllowRequest([ALLOWED_ORIGIN]),
      path: '/socket.io/',
    })
    state = setupSocketServer(io, {
      postUserMessageForPod: async (shareId, username, avatarUrl, text) => {
        podMessages.push({ shareId, username, avatarUrl, text })
      },
      postLobbyMessage: async (lobbyType, username) => {
        lobbyMessages.push({ lobbyType, username })
      },
      delistPods: async () => {},
      delistDelayMs: 50,
    })
    await new Promise<void>(resolve => httpServer.listen(0, resolve))
    port = (httpServer.address() as AddressInfo).port
  })

  after(async () => {
    for (const client of openClients) client.disconnect()
    for (const timer of state.delistTimers.values()) clearTimeout(timer)
    io.close()
    await new Promise<void>(resolve => { httpServer.close(() => resolve()) })
  })

  it('unauthenticated socket can presence:subscribe and join read-only rooms', async () => {
    const anon = connect()
    await connected(anon)

    const count = await new Promise<number>((resolve) => {
      anon.on('presence:count', (data: { count: number }) => resolve(data.count))
      anon.emit('presence:subscribe')
    })
    assert.strictEqual(typeof count, 'number')

    // join-draft works anonymously: a room broadcast reaches the socket
    anon.emit('join-draft', 'share-anon')
    await sleep(100)
    const got = new Promise<string>((resolve) => anon.on('draft:ping', (d: string) => resolve(d)))
    io.to('draft:share-anon').emit('draft:ping', 'hello')
    assert.strictEqual(await got, 'hello')
  })

  it('unauthenticated chat:send is dropped (no broadcast, no Discord relay)', async () => {
    const anon = connect()
    const listener = connect()
    await Promise.all([connected(anon), connected(listener)])

    listener.emit('join-chat', 'share-1')
    anon.emit('join-chat', 'share-1')
    await sleep(100)

    let received = false
    listener.on('chat:message', () => { received = true })

    anon.emit('chat:send', { shareId: 'share-1', text: 'spoofed', username: 'FakeAdmin', avatarUrl: null })
    await sleep(200)

    assert.strictEqual(received, false, 'no chat:message may be broadcast for an anonymous sender')
    assert.strictEqual(podMessages.length, 0, 'nothing may be relayed to Discord')
  })

  it('authenticated chat carries the JWT identity even when the payload claims another name', async () => {
    const token = createToken(realUser)
    const sender = connect({ token })
    const listener = connect()
    await Promise.all([connected(sender), connected(listener)])

    listener.emit('join-chat', 'share-2')
    await sleep(100)

    const messagePromise = new Promise<{ username: string; avatarUrl: string | null }>((resolve) => {
      listener.on('chat:message', (m: { username: string; avatarUrl: string | null }) => resolve(m))
    })

    // Payload impersonates another user — server must ignore it.
    sender.emit('chat:send', { shareId: 'share-2', text: 'hi', username: 'Impersonated', avatarUrl: 'https://evil.example/x.png' })

    const message = await messagePromise
    assert.strictEqual(message.username, 'RealUser')
    assert.strictEqual(message.avatarUrl, realUser.avatar_url)
    assert.strictEqual(podMessages.length, 1)
    assert.strictEqual(podMessages[0].username, 'RealUser', 'Discord relay shows the verified identity')
    assert.strictEqual(podMessages[0].avatarUrl, realUser.avatar_url)
  })

  it('lobby chat enforces the same identity rules', async () => {
    const token = createToken(otherUser)
    const sender = connect({ token })
    await connected(sender)
    sender.emit('lobby-chat:send', { lobbyType: 'draft', text: 'yo', username: 'Forged' })
    await sleep(200)
    assert.strictEqual(lobbyMessages.length, 1)
    assert.strictEqual(lobbyMessages[0].username, 'OtherUser')
  })

  it('presence:join counts the verified user id, ignoring any forged payload', async () => {
    const token = createToken(realUser)
    const authed = connect({ token })
    await connected(authed)

    // Client-side code passes a userId argument — the server must ignore it.
    authed.emit('presence:join', 'forged-user-id')
    await sleep(200)

    assert.ok(state.presenceMap.has(realUser.id), 'presence keyed by the session user id')
    assert.ok(!state.presenceMap.has('forged-user-id'), 'forged id must not be counted')
  })

  it('anonymous presence:join is not counted', async () => {
    const anon = connect()
    await connected(anon)
    const before = state.presenceMap.size
    anon.emit('presence:join', 'whoever')
    await sleep(200)
    assert.strictEqual(state.presenceMap.size, before)
  })

  it('cross-origin handshake (wrong Origin header) is rejected', async () => {
    const evil = connect({ origin: 'http://evil.example' })
    const result = await connected(evil).then(() => 'connected', () => 'rejected')
    assert.strictEqual(result, 'rejected')
  })

  it('allowed-origin handshake succeeds', async () => {
    const good = connect({ origin: ALLOWED_ORIGIN })
    const result = await connected(good).then(() => 'connected', () => 'rejected')
    assert.strictEqual(result, 'connected')
  })

  it('socket with a garbage session cookie is treated as anonymous (not disconnected)', async () => {
    const junk = connect({ token: 'not-a-jwt' })
    await connected(junk)
    let relayed = false
    junk.emit('chat:send', { shareId: 'share-3', text: 'x' })
    await sleep(150)
    assert.strictEqual(podMessages.some(m => m.shareId === 'share-3'), relayed)
  })
})
