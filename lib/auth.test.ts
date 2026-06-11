// @ts-nocheck
// Tests for authentication utilities
import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert'
import { spawnSync } from 'node:child_process'

// The privileged-gate tests need a real DB (auth_version freshness check).
// Pin the connection to the local test database BEFORE lib/db's module init
// — never a DATABASE_URL pointing at a shared environment.
const TEST_DB_URL =
  process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'
process.env['DATABASE_URL'] = TEST_DB_URL
process.env['POSTGRES_URL'] = TEST_DB_URL

const { createToken, verifyToken, getSession, requireAuth, requireAdmin, requireBetaAccess, sanitizeReturnTo } = await import('./auth.ts')
const db = await import('./db.ts')

let dbAvailable = false
try {
  dbAvailable = await db.testConnection()
} catch {
  dbAvailable = false
}
if (!dbAvailable) {
  console.warn(`⚠️  lib/auth.test.ts: test DB unreachable at ${TEST_DB_URL} — skipping privilege-freshness tests.`)
}

const testUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  username: 'testuser',
  avatar_url: null,
  is_admin: false,
  is_beta_tester: false,
}

describe('Auth Utilities', () => {
  describe('createToken', () => {
    it('should include role flags in token payload', () => {
      const user = {
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        avatar_url: 'https://example.com/avatar.png',
        is_admin: true,
        is_beta_tester: true,
      }

      const token = createToken(user)
      const decoded = verifyToken(token)
      assert.ok(decoded)
      assert.strictEqual(decoded.is_admin, true)
      assert.strictEqual(decoded.is_beta_tester, true)
    })

    it('should default role flags to false when not provided', () => {
      const user = {
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        avatar_url: null,
      }

      const token = createToken(user)
      const decoded = verifyToken(token)
      assert.ok(decoded)
      assert.strictEqual(decoded.is_admin, false)
      assert.strictEqual(decoded.is_beta_tester, false)
    })
  })

  describe('verifyToken', () => {
    it('roundtrips with createToken', () => {
      const token = createToken(testUser)
      const decoded = verifyToken(token)
      assert.ok(decoded)
      assert.strictEqual(decoded.id, testUser.id)
      assert.strictEqual(decoded.email, testUser.email)
      assert.strictEqual(decoded.username, testUser.username)
    })

    it('returns null for invalid token', () => {
      assert.strictEqual(verifyToken('not-a-jwt'), null)
    })

    it('returns null for empty string', () => {
      assert.strictEqual(verifyToken(''), null)
    })
  })

  describe('getSession - Bearer token support', () => {
    it('returns null when no auth is provided', () => {
      const request = new Request('http://localhost/api/test')
      const session = getSession(request)
      assert.strictEqual(session, null)
    })

    it('works with valid Bearer token', () => {
      const token = createToken(testUser)
      const request = new Request('http://localhost/api/test', {
        headers: { authorization: `Bearer ${token}` },
      })
      const session = getSession(request)
      assert.ok(session)
      assert.strictEqual(session.id, testUser.id)
      assert.strictEqual(session.email, testUser.email)
      assert.strictEqual(session.username, testUser.username)
    })

    it('returns null for invalid Bearer token', () => {
      const request = new Request('http://localhost/api/test', {
        headers: { authorization: 'Bearer invalid-token-here' },
      })
      const session = getSession(request)
      assert.strictEqual(session, null)
    })

    it('works with valid cookie', () => {
      const token = createToken(testUser)
      const request = new Request('http://localhost/api/test', {
        headers: { cookie: `swupod_session=${token}` },
      })
      const session = getSession(request)
      assert.ok(session)
      assert.strictEqual(session.id, testUser.id)
    })

    it('Bearer token takes priority over cookie', () => {
      const otherUser = { ...testUser, id: 'other-user-456', username: 'other' }
      const bearerToken = createToken(testUser)
      const cookieToken = createToken(otherUser)

      const request = new Request('http://localhost/api/test', {
        headers: {
          authorization: `Bearer ${bearerToken}`,
          cookie: `swupod_session=${cookieToken}`,
        },
      })
      const session = getSession(request)
      assert.ok(session)
      assert.strictEqual(session.id, testUser.id, 'Bearer token should take priority')
    })

    it('falls back to cookie when Bearer token is invalid', () => {
      const token = createToken(testUser)
      const request = new Request('http://localhost/api/test', {
        headers: {
          authorization: 'Bearer invalid',
          cookie: `swupod_session=${token}`,
        },
      })
      const session = getSession(request)
      assert.ok(session)
      assert.strictEqual(session.id, testUser.id, 'Should fall back to cookie')
    })
  })

  describe('requireBetaAccess logic', () => {
    it('should pass for beta testers', () => {
      const session = { id: '123', is_beta_tester: true, is_admin: false }
      const hasBetaAccess = session.is_beta_tester || session.is_admin
      assert.strictEqual(hasBetaAccess, true)
    })

    it('should pass for admins', () => {
      const session = { id: '123', is_beta_tester: false, is_admin: true }
      const hasBetaAccess = session.is_beta_tester || session.is_admin
      assert.strictEqual(hasBetaAccess, true)
    })

    it('should fail for regular users', () => {
      const session = { id: '123', is_beta_tester: false, is_admin: false }
      const hasBetaAccess = session.is_beta_tester || session.is_admin
      assert.strictEqual(hasBetaAccess, false)
    })
  })

  describe('requireAdmin logic', () => {
    it('should pass for admins', () => {
      const session = { id: '123', is_admin: true }
      assert.strictEqual(session.is_admin, true)
    })

    it('should fail for non-admins', () => {
      const session = { id: '123', is_admin: false }
      assert.strictEqual(session.is_admin, false)
    })
  })
})

describe('Error handling for role-based access', () => {
  it('should map "Beta access required" to 403', () => {
    const error = new Error('Beta access required')
    let status = 500
    if (error.message === 'Beta access required') status = 403
    assert.strictEqual(status, 403)
  })

  it('should map "Admin access required" to 403', () => {
    const error = new Error('Admin access required')
    let status = 500
    if (error.message === 'Admin access required') status = 403
    assert.strictEqual(status, 403)
  })

  it('should map "Unauthorized" to 401', () => {
    const error = new Error('Unauthorized')
    let status = 500
    if (error.message === 'Unauthorized') status = 401
    assert.strictEqual(status, 401)
  })
})

describe('createToken auth_version claim (U4)', () => {
  it('embeds the user auth_version in the token', () => {
    const token = createToken({ ...testUser, auth_version: 7 })
    const decoded = verifyToken(token)
    assert.strictEqual(decoded.auth_version, 7)
  })

  it('defaults auth_version to 1 when not provided', () => {
    const token = createToken(testUser)
    const decoded = verifyToken(token)
    assert.strictEqual(decoded.auth_version, 1)
  })
})

describe('sanitizeReturnTo (U4 open-redirect hardening)', () => {
  it('accepts normal app-local paths', () => {
    assert.strictEqual(sanitizeReturnTo('/'), '/')
    assert.strictEqual(sanitizeReturnTo('/draft/abc123'), '/draft/abc123')
    assert.strictEqual(sanitizeReturnTo('/pool/x?tab=deck'), '/pool/x?tab=deck')
  })

  it('rejects protocol-relative URLs', () => {
    assert.strictEqual(sanitizeReturnTo('//evil.com'), '/')
    assert.strictEqual(sanitizeReturnTo('//evil.com/path'), '/')
  })

  it('rejects absolute URLs', () => {
    assert.strictEqual(sanitizeReturnTo('https://evil.com'), '/')
    assert.strictEqual(sanitizeReturnTo('http://evil.com/x'), '/')
  })

  it('rejects non-strings and junk', () => {
    assert.strictEqual(sanitizeReturnTo(null), '/')
    assert.strictEqual(sanitizeReturnTo(undefined), '/')
    assert.strictEqual(sanitizeReturnTo(42), '/')
    assert.strictEqual(sanitizeReturnTo('javascript:alert(1)'), '/')
    assert.strictEqual(sanitizeReturnTo('relative/path'), '/')
  })
})

describe('production secret hard-fail (U4)', () => {
  it('module load throws in production without JWT_SECRET/NEXTAUTH_SECRET', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx/esm', '-e', "import('./lib/auth.ts').then(() => process.exit(0), () => process.exit(42))"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          JWT_SECRET: '',
          NEXTAUTH_SECRET: '',
        },
        encoding: 'utf8',
        timeout: 60000,
      }
    )
    assert.strictEqual(result.status, 42, `expected module load to reject (stderr: ${result.stderr?.slice(0, 300)})`)
  })

  it('module load succeeds in production WITH a secret', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx/esm', '-e', "import('./lib/auth.ts').then(() => process.exit(0), (e) => { console.error(e); process.exit(42) })"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          JWT_SECRET: 'a-real-secret',
        },
        encoding: 'utf8',
        timeout: 60000,
      }
    )
    assert.strictEqual(result.status, 0, `expected module load to succeed (stderr: ${result.stderr?.slice(0, 300)})`)
  })
})

describe('privilege freshness via auth_version (U4, DB-backed)', { skip: !dbAvailable }, () => {
  const { query, queryRow, closePool } = db
  let adminId

  async function seedAdmin() {
    const row = await queryRow(
      `INSERT INTO users (username, email, is_admin, is_beta_tester, auth_version)
       VALUES ('auth-test-admin', $1, true, true, 1) RETURNING id, auth_version`,
      [`auth-test-${Date.now()}@example.test`]
    )
    adminId = row.id
    return row
  }

  function requestWithToken(token) {
    return new Request('http://localhost/api/test', {
      headers: { authorization: `Bearer ${token}` },
    })
  }

  it('admin token minted at version 1 fails requireAdmin after a version bump, then succeeds with a refreshed token', async (t) => {
    const row = await seedAdmin()
    t.after(async () => { await query('DELETE FROM users WHERE id = $1', [adminId]) })

    const adminUser = { id: adminId, email: 'x@example.test', username: 'auth-test-admin', is_admin: true, is_beta_tester: true, auth_version: Number(row.auth_version) }
    const token = createToken(adminUser)

    // Fresh token at version 1 passes
    const session = await requireAdmin(requestWithToken(token))
    assert.strictEqual(session.id, adminId)

    // Revoke-style bump: old token now fails the privileged gate with Unauthorized (→ 401)
    await query('UPDATE users SET auth_version = auth_version + 1 WHERE id = $1', [adminId])
    await assert.rejects(requireAdmin(requestWithToken(token)), /Unauthorized/)

    // requireAuth (ordinary auth) still accepts the same token — no DB check by design
    const plain = requireAuth(requestWithToken(token))
    assert.strictEqual(plain.id, adminId)

    // Simulated /api/auth/refresh: token reissued from the fresh row passes again
    const freshRow = await queryRow('SELECT auth_version FROM users WHERE id = $1', [adminId])
    const refreshed = createToken({ ...adminUser, auth_version: Number(freshRow.auth_version) })
    const session2 = await requireAdmin(requestWithToken(refreshed))
    assert.strictEqual(session2.id, adminId)
  })

  it('token without an auth_version claim is rejected by privileged gates but accepted by requireAuth', async (t) => {
    const row = await seedAdmin()
    t.after(async () => { await query('DELETE FROM users WHERE id = $1', [adminId]) })

    // Mint a legacy-shaped token (no auth_version claim) by signing manually
    const jwt = (await import('jsonwebtoken')).default
    const legacyToken = jwt.sign(
      { id: adminId, email: 'x@example.test', username: 'auth-test-admin', is_admin: true, is_beta_tester: true },
      process.env['JWT_SECRET'] || process.env['NEXTAUTH_SECRET'] || 'change-me-in-production',
      { expiresIn: '30d' }
    )

    await assert.rejects(requireAdmin(requestWithToken(legacyToken)), /Unauthorized/, 'old tokens fail closed on privileged routes')
    await assert.rejects(requireBetaAccess(requestWithToken(legacyToken)), /Unauthorized/)

    const plain = requireAuth(requestWithToken(legacyToken))
    assert.strictEqual(plain.id, adminId, 'ordinary auth keeps working until refresh')
  })

  it('requireBetaAccess enforces freshness the same way', async (t) => {
    const row = await seedAdmin()
    t.after(async () => {
      await query('DELETE FROM users WHERE id = $1', [adminId])
      await closePool()
    })

    const user = { id: adminId, email: 'x@example.test', username: 'auth-test-admin', is_admin: false, is_beta_tester: true, auth_version: Number(row.auth_version) }
    const token = createToken(user)
    const session = await requireBetaAccess(requestWithToken(token))
    assert.strictEqual(session.id, adminId)

    await query('UPDATE users SET auth_version = auth_version + 1 WHERE id = $1', [adminId])
    await assert.rejects(requireBetaAccess(requestWithToken(token)), /Unauthorized/)
  })
})

console.log('\n🔐 Running auth tests...\n')
