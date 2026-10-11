// Signed-out solo draft, end to end against a throwaway PostgreSQL database.
// Explicit opt-in; creates and drops its own database on the local /tmp socket:
//   GUEST_DRAFT_DB_TEST=1 npx tsx --test app/api/draft/guest-solo.db.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

test('a guest solo-drafts without Discord; pods with people still need a login', { skip: process.env.GUEST_DRAFT_DB_TEST !== '1', timeout: 120000 }, async () => {
  const database = `ptp_guest_draft_test_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Client({ host: '/tmp', database: 'postgres' })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${database}`)
  const db = new pg.Client({ host: '/tmp', database })
  await db.connect()
  try {
    const dir = join(process.cwd(), 'migrations')
    for (const file of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) {
      const sql = await readFile(join(dir, file), 'utf8')
      // CREATE INDEX CONCURRENTLY cannot run in a multi-statement query; indexes do not matter here.
      await db.query(sql.replaceAll('CONCURRENTLY', ''))
    }
    process.env.DATABASE_URL = `postgresql://${process.env.USER}@localhost/${database}`
    process.env.POSTGRES_URL = process.env.DATABASE_URL

    const { createToken, GUEST_COOKIE } = await import('@/lib/auth')
    const createRoute = await import('./route')
    const draftRoute = await import('./[shareId]/route')
    const addBots = await import('./[shareId]/dev/add-bots/route')
    const start = await import('./[shareId]/start/route')
    const join_ = await import('./[shareId]/join/route')
    const poolRoute = await import('./[shareId]/pool/route')
    const pools = await import('@/app/api/pools/[shareId]/route')

    const call = async (handler: Function, path: string, { method = 'GET', cookie, body, shareId }: { method?: string; cookie?: string; body?: unknown; shareId?: string } = {}) => {
      const request = new Request(`http://localhost${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      const response: Response = await handler(request, { params: Promise.resolve({ shareId }) })
      return { status: response.status, cookie: response.headers.get('set-cookie'), json: await response.json().catch(() => null) }
    }
    const solo = { setCode: 'SOR', isPublic: false, settings: { isSolo: true } }
    const group = { setCode: 'SOR', isPublic: true, settings: { afterDraft: 'swiss', emptySeats: 'bots' } }

    // Signed out: a pod with other people needs a login.
    assert.equal((await call(createRoute.POST, '/api/draft', { method: 'POST', body: group })).status, 401)

    // Signed out: a solo draft makes a guest and hands back the guest cookie.
    const created = await call(createRoute.POST, '/api/draft', { method: 'POST', body: solo })
    assert.equal(created.status, 201, JSON.stringify(created.json))
    assert.match(created.cookie || '', new RegExp(`^${GUEST_COOKIE}=[^;]+; HttpOnly`))
    const guestCookie = created.cookie!.split(';')[0]!
    const shareId = created.json.data.shareId
    const pod = (await db.query('SELECT id, host_id, is_public, competitive, settings FROM pods WHERE share_id = $1', [shareId])).rows[0]
    assert.equal(pod.is_public, false)
    assert.equal(pod.competitive, false)
    assert.equal(pod.settings.isSolo, true)
    const guest = (await db.query('SELECT * FROM users WHERE id = $1', [pod.host_id])).rows[0]
    assert.match(guest.discord_id, /^guest_/)
    assert.equal(guest.email, null)
    assert.equal(guest.is_admin, false)
    assert.equal(guest.is_alpha_tester, false)
    assert.equal(guest.is_beta_tester, false)

    // The same guest is reused, and still cannot make a pod with people in it.
    const again = await call(createRoute.POST, '/api/draft', { method: 'POST', body: solo, cookie: guestCookie })
    assert.equal(again.status, 201)
    assert.equal((await db.query('SELECT host_id FROM pods WHERE share_id = $1', [again.json.data.shareId])).rows[0].host_id, pod.host_id)
    assert.equal((await call(createRoute.POST, '/api/draft', { method: 'POST', body: group, cookie: guestCookie })).status, 401)
    // A guest token is not a session.
    assert.equal((await call(createRoute.POST, '/api/draft', { method: 'POST', body: group, cookie: `swupod_session=${guestCookie.split('=')[1]}` })).status, 401)

    // Bots fill the table; the guest is host and player, a stranger is neither.
    assert.equal((await call(addBots.POST, `/api/draft/${shareId}/dev/add-bots?count=7`, { method: 'POST', shareId })).status, 200)
    const mine = await call(draftRoute.GET, `/api/draft/${shareId}`, { cookie: guestCookie, shareId })
    assert.equal(mine.json.data.isHost, true)
    assert.equal(mine.json.data.isPlayer, true)
    const stranger = await call(draftRoute.GET, `/api/draft/${shareId}`, { shareId })
    assert.equal(stranger.json.data.isPlayer, false)

    // The guest starts their draft; nobody else can.
    assert.equal((await call(start.POST, `/api/draft/${shareId}/start`, { method: 'POST', shareId })).status, 401)
    const started = await call(start.POST, `/api/draft/${shareId}/start`, { method: 'POST', cookie: guestCookie, shareId })
    assert.equal(started.status, 200, JSON.stringify(started.json))
    // The pool waits for the draft to finish (not an auth failure).
    assert.equal((await call(poolRoute.GET, `/api/draft/${shareId}/pool`, { cookie: guestCookie, shareId })).status, 400)

    // A guest cannot join a signed-in player's pod.
    const host = (await db.query(`INSERT INTO users (username, discord_id) VALUES ('Host', '123') RETURNING id`)).rows[0].id
    const hostCookie = `swupod_session=${createToken({ id: host, email: '', username: 'Host' })}`
    const groupPod = await call(createRoute.POST, '/api/draft', { method: 'POST', body: group, cookie: hostCookie })
    assert.equal(groupPod.status, 201)
    assert.equal((await call(join_.POST, `/api/draft/${groupPod.json.data.shareId}/join`, { method: 'POST', cookie: guestCookie, shareId: groupPod.json.data.shareId })).status, 401)

    // The guest owns and edits their drafted pool; nobody else does.
    const poolShareId = `g${randomUUID().slice(0, 7)}`
    await db.query(`INSERT INTO card_pools (user_id, share_id, set_code, pool_type, cards, pod_id) VALUES ($1, $2, 'SOR', 'draft', '[]', $3)`, [pod.host_id, poolShareId, pod.id])
    assert.equal((await call(pools.GET, `/api/pools/${poolShareId}`, { cookie: guestCookie, shareId: poolShareId })).json.data.viewerIsOwner, true)
    assert.equal((await call(pools.GET, `/api/pools/${poolShareId}`, { shareId: poolShareId })).json.data.viewerIsOwner, false)
    assert.equal((await call(pools.GET, `/api/pools/${poolShareId}`, { cookie: hostCookie, shareId: poolShareId })).json.data.viewerIsOwner, false)
    const edit = { deckBuilderState: { deck: [] } }
    assert.equal((await call(pools.PUT, `/api/pools/${poolShareId}`, { method: 'PUT', body: edit, cookie: guestCookie, shareId: poolShareId })).status, 200)
    assert.equal((await call(pools.PUT, `/api/pools/${poolShareId}`, { method: 'PUT', body: edit, shareId: poolShareId })).status, 401)
    assert.equal((await call(pools.PUT, `/api/pools/${poolShareId}`, { method: 'PUT', body: edit, cookie: hostCookie, shareId: poolShareId })).status, 403)
  } finally {
    await (await import('@/lib/db')).closePool().catch(() => {})
    await db.end()
    await admin.query(`DROP DATABASE ${database} WITH (FORCE)`)
    await admin.end()
  }
})
