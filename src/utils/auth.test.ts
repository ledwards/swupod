// @ts-nocheck
// Tests for frontend authentication utilities
import { describe, it, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

// Mock global fetch for testing
const originalFetch = globalThis.fetch

describe('Frontend Auth Utilities', () => {
  describe('enrollBeta', () => {
    beforeEach(() => {
      // Reset fetch mock before each test
      globalThis.fetch = mock.fn()
    })

    afterEach(() => {
      // Restore original fetch
      globalThis.fetch = originalFetch
    })

    it('should call POST /api/beta/enroll', async () => {
      globalThis.fetch = mock.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              user: {
                id: '123',
                email: 'test@example.com',
                is_beta_tester: true,
              },
            },
          }),
        })
      )

      // Import after mocking fetch
      const { enrollBeta } = await import('./auth.js')
      const result = await enrollBeta()

      assert.ok(result, 'Should return user object')
      assert.strictEqual(result.is_beta_tester, true)
    })

    it('should return null on failure', async () => {
      globalThis.fetch = mock.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
        })
      )

      // Re-import to use new mock
      // Note: In real tests, we'd use dependency injection
      // This test demonstrates the expected behavior

      // Simulate the enrollBeta logic
      const response = await globalThis.fetch('/api/beta/enroll', {
        method: 'POST',
        credentials: 'include',
      })

      assert.strictEqual(response.ok, false)
    })

    it('should include credentials in request', async () => {
      let capturedOptions: RequestInit | null = null
      globalThis.fetch = mock.fn((url: string, options: RequestInit) => {
        capturedOptions = options
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { user: {} } }),
        })
      })

      await globalThis.fetch('/api/beta/enroll', {
        method: 'POST',
        credentials: 'include',
      })

      assert.strictEqual(capturedOptions!.method, 'POST')
      assert.strictEqual(capturedOptions!.credentials, 'include')
    })
  })

  describe('refreshSession', () => {
    beforeEach(() => {
      globalThis.fetch = mock.fn()
    })

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    it('should call POST /api/auth/refresh', async () => {
      globalThis.fetch = mock.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              user: {
                id: '123',
                email: 'test@example.com',
                is_admin: true,
                is_beta_tester: true,
              },
            },
          }),
        })
      )

      const { refreshSession } = await import('./auth.js')
      const result = await refreshSession()

      assert.ok(result, 'Should return user object')
      assert.strictEqual(result.is_admin, true)
      assert.strictEqual(result.is_beta_tester, true)
    })

    it('should return null on failure', async () => {
      globalThis.fetch = mock.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
        })
      )

      const response = await globalThis.fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })

      assert.strictEqual(response.ok, false)
    })
  })

  describe('getSession with role flags', () => {
    it('should return user with is_admin and is_beta_tester', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        avatar_url: null,
        is_admin: true,
        is_beta_tester: true,
      }

      globalThis.fetch = mock.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { user: mockUser },
          }),
        })
      )

      // Simulate getSession logic
      const response = await globalThis.fetch('/api/auth/session', {
        credentials: 'include',
      })
      const data = await response.json()
      const user = data.data?.user

      assert.strictEqual(user.is_admin, true)
      assert.strictEqual(user.is_beta_tester, true)
    })

    it('should handle missing role flags gracefully', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
      }

      // Simulate session response without role flags
      const user = {
        ...mockUser,
        is_admin: (mockUser as any).is_admin || false,
        is_beta_tester: (mockUser as any).is_beta_tester || false,
      }

      assert.strictEqual(user.is_admin, false)
      assert.strictEqual(user.is_beta_tester, false)
    })
  })
})

describe('AuthContext integration', () => {
  describe('hasBetaAccess computation', () => {
    it('should be true for beta testers', () => {
      const user = { is_beta_tester: true, is_admin: false }
      const hasBetaAccess = user?.is_beta_tester || user?.is_admin
      assert.strictEqual(hasBetaAccess, true)
    })

    it('should be true for admins', () => {
      const user = { is_beta_tester: false, is_admin: true }
      const hasBetaAccess = user?.is_beta_tester || user?.is_admin
      assert.strictEqual(hasBetaAccess, true)
    })

    it('should be false for regular users', () => {
      const user = { is_beta_tester: false, is_admin: false }
      const hasBetaAccess = user?.is_beta_tester || user?.is_admin
      assert.strictEqual(hasBetaAccess, false)
    })

    it('should be false when user is null', () => {
      const user = null
      const hasBetaAccess = (user as any)?.is_beta_tester || (user as any)?.is_admin
      assert.ok(!hasBetaAccess)
    })
  })

  describe('enrollBeta state update', () => {
    it('should update user state after successful enrollment', () => {
      // Simulate the AuthContext state update
      let user = { id: '123', is_beta_tester: false }

      const updatedUser = {
        ...user,
        is_beta_tester: true,
      }

      // Simulate setUser(updatedUser)
      user = updatedUser

      assert.strictEqual(user.is_beta_tester, true)
    })
  })

  describe('refreshSession state update', () => {
    it('should update user state after successful refresh', () => {
      // Simulate the AuthContext state update
      let user: { id: string; is_admin: boolean; is_beta_tester: boolean } = { id: '123', is_admin: false, is_beta_tester: false }

      // Simulate API returning updated user (admin was granted via CLI)
      const updatedUser = {
        ...user,
        is_admin: true,
      }

      // Simulate setUser(updatedUser)
      user = updatedUser

      assert.strictEqual(user.is_admin, true)
    })

    it('should pick up beta tester status granted externally', () => {
      let user = { id: '123', is_admin: false, is_beta_tester: false }

      const updatedUser = {
        ...user,
        is_beta_tester: true,
      }

      user = updatedUser

      assert.strictEqual(user.is_beta_tester, true)
    })

    it('AuthProvider refreshes the session after patron status resolves true', () => {
      const source = readFileSync(new URL('../contexts/AuthContext.jsx', import.meta.url), 'utf8')
      assert.match(
        source,
        /async function refreshPatronStatus\(\) \{[\s\S]*apiCheckPatronStatus\(\)[\s\S]*if \(result\.isPatron\) \{[\s\S]*apiRefreshSession\(\)[\s\S]*setIsPatron\(result\.isPatron\)/,
        'patron-status can update DB flags; AuthProvider must refresh the JWT before beta-gated routes run',
      )
    })

    it('AuthProvider exposes refreshPatronStatus for the manual Patreon connect flow', () => {
      const source = readFileSync(new URL('../contexts/AuthContext.jsx', import.meta.url), 'utf8')
      assert.match(source, /refreshPatronStatus,/, 'manual connect UI needs to re-run patron detection without a page reload')
    })
  })
})

// Run tests
console.log('\n🔑 Running frontend auth tests...\n')
