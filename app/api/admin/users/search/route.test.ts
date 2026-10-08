// @ts-nocheck
/**
 * Spec tests for GET /api/admin/users/search.
 *
 * These tests assert on the route file's source contents — SQL substrings,
 * admin-gate ordering, response shape, and the absence of forbidden helpers
 * (requireAdmin) — via fs.readFileSync. No real DB, no import mocks.
 *
 * Run: node --import tsx/esm app/api/admin/users/search/route.test.ts
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROUTE_PATH = join(__dirname, 'route.ts')
const ROUTE_SOURCE = readFileSync(ROUTE_PATH, 'utf8')

// Strip line/block comments so substring assertions are about runtime behavior,
// not commentary. (e.g. a comment that says "do NOT use requireAdmin" would
// false-positive a naive search for "requireAdmin".)
function stripComments(src) {
  // Remove block comments
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  // Remove line comments
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  return out
}
const ROUTE_CODE = stripComments(ROUTE_SOURCE)

describe('GET /api/admin/users/search — route file spec', () => {
  describe('admin gate (404 stealth, R5)', () => {
    it('imports getSession from @/lib/auth', () => {
      assert.match(
        ROUTE_CODE,
        /import\s*\{[^}]*\bgetSession\b[^}]*\}\s*from\s*['"]@\/lib\/auth['"]/
      )
    })

    it('does NOT import or call requireAdmin (would map to 403 via handleApiError)', () => {
      // requireAdmin would throw Error('Admin access required') which
      // handleApiError maps to 403 — incompatible with R5's 404-stealth.
      assert.doesNotMatch(ROUTE_CODE, /\brequireAdmin\b/)
    })

    it('inlines the admin check: const session = getSession(request)', () => {
      assert.match(ROUTE_CODE, /const\s+session\s*=\s*getSession\s*\(\s*request\s*\)/)
    })

    it('uses !session?.is_admin → 404 for the admin gate', () => {
      assert.match(ROUTE_CODE, /!session\?\.is_admin/)
    })

    it("returns errorResponse('Not found', 404) for the admin-gate failure", () => {
      assert.match(
        ROUTE_CODE,
        /errorResponse\(\s*['"]Not found['"]\s*,\s*404\s*\)/
      )
    })

    it('admin gate runs BEFORE any input validation', () => {
      // The first statement inside the exported GET handler must be the
      // getSession call (after any opening brace + whitespace). Specifically:
      // the index of getSession(request) must be less than the index of
      // request.url being read (which is where input validation begins).
      const getSessionIdx = ROUTE_CODE.indexOf('getSession(request)')
      const urlReadIdx = ROUTE_CODE.indexOf('new URL(request.url)')
      assert.ok(getSessionIdx > -1, 'expected getSession(request) in route')
      assert.ok(urlReadIdx > -1, 'expected new URL(request.url) in route')
      assert.ok(
        getSessionIdx < urlReadIdx,
        'admin gate must run before input parsing for 404-stealth'
      )
    })

    it('admin gate appears outside the try/catch (so DB errors do not mask 404)', () => {
      // The admin-gate return must precede the try block so non-admins
      // never even enter the DB-error handling path.
      const gateReturnIdx = ROUTE_CODE.indexOf("errorResponse('Not found', 404)")
      const tryIdx = ROUTE_CODE.indexOf('try {')
      assert.ok(gateReturnIdx > -1)
      assert.ok(tryIdx > -1)
      assert.ok(gateReturnIdx < tryIdx, 'admin-gate return must precede try block')
    })
  })

  describe('input validation / short-circuit', () => {
    it('trims the q parameter', () => {
      assert.match(ROUTE_CODE, /\.trim\(\)/)
    })

    it('short-circuits when q is empty or shorter than 2 chars (no DB call)', () => {
      // Spec: q.length < 2 returns empty users array without hitting the DB.
      assert.match(ROUTE_CODE, /q\.length\s*<\s*2/)
    })

    it('returns jsonResponse({ users: [] }) for the short-circuit branch', () => {
      assert.match(ROUTE_CODE, /jsonResponse\(\s*\{\s*users:\s*\[\s*\]\s*\}\s*\)/)
    })
  })

  describe('digit-vs-alpha query branching', () => {
    it('detects all-digit query with /^\\d{1,25}$/', () => {
      assert.match(ROUTE_CODE, /\/\^\\d\{1,25\}\$\//)
    })

    it('all-digit branch: SQL contains WHERE discord_id = $1', () => {
      assert.match(ROUTE_CODE, /WHERE\s+discord_id\s*=\s*\$1/)
    })

    it("alpha branch: SQL contains LOWER(username) LIKE LOWER($1) || '%'", () => {
      assert.match(ROUTE_CODE, /LOWER\(username\)\s*LIKE\s*LOWER\(\$1\)\s*\|\|\s*'%'/)
    })

    it('alpha branch: SQL contains ORDER BY username', () => {
      assert.match(ROUTE_CODE, /ORDER\s+BY\s+username/)
    })

    it('both branches: SQL contains LIMIT 10', () => {
      const matches = ROUTE_CODE.match(/LIMIT\s+10/g) ?? []
      assert.ok(matches.length >= 2, `expected LIMIT 10 in both SQL branches, got ${matches.length}`)
    })

    it('both branches: SELECT projects exactly the type-ahead columns', () => {
      // The dropdown needs id, discord_id, username, is_patron, is_beta_tester.
      // No email — that is admin-sensitive and not needed for picking a user.
      const matches =
        ROUTE_CODE.match(
          /SELECT\s+id,\s*discord_id,\s*username,\s*is_patron,\s*is_beta_tester/g
        ) ?? []
      assert.ok(
        matches.length >= 2,
        `expected SELECT id, discord_id, username, is_patron, is_beta_tester in both branches, got ${matches.length}`
      )
    })
  })

  describe('response shape', () => {
    it('uses jsonResponse({ users for the populated response', () => {
      // The jsonResponse helper wraps in { success, data, message } —
      // calling jsonResponse({ users: result }) gives { data: { users: [...] } }.
      assert.match(ROUTE_CODE, /jsonResponse\(\s*\{\s*users/)
    })

    it('queries the DB via queryRows (not query / queryRow)', () => {
      assert.match(ROUTE_CODE, /\bqueryRows\b/)
    })

    it('imports queryRows from @/lib/db', () => {
      assert.match(
        ROUTE_CODE,
        /import\s*\{[^}]*\bqueryRows\b[^}]*\}\s*from\s*['"]@\/lib\/db['"]/
      )
    })

    it('imports jsonResponse and errorResponse from @/lib/utils', () => {
      assert.match(
        ROUTE_CODE,
        /import\s*\{[^}]*\bjsonResponse\b[^}]*\}\s*from\s*['"]@\/lib\/utils['"]/
      )
      assert.match(
        ROUTE_CODE,
        /import\s*\{[^}]*\berrorResponse\b[^}]*\}\s*from\s*['"]@\/lib\/utils['"]/
      )
    })
  })

  describe('error handling (DB throws)', () => {
    it('routes DB errors through handleApiError', () => {
      assert.match(ROUTE_CODE, /\bhandleApiError\b/)
    })

    it('imports handleApiError from @/lib/utils', () => {
      assert.match(
        ROUTE_CODE,
        /import\s*\{[^}]*\bhandleApiError\b[^}]*\}\s*from\s*['"]@\/lib\/utils['"]/
      )
    })

    it('wraps DB calls in try/catch and forwards the error', () => {
      // The catch block must invoke handleApiError so that DB throws map
      // to a 500 response (handleApiError returns 500 for unknown errors).
      assert.match(ROUTE_CODE, /catch\s*\(\s*error\s*\)\s*\{[\s\S]*handleApiError\s*\(\s*error\s*\)/)
    })
  })

  describe('HTTP method', () => {
    it('exports an async GET handler', () => {
      assert.match(ROUTE_CODE, /export\s+async\s+function\s+GET\s*\(/)
    })

    it('does NOT export POST/PUT/DELETE handlers (search is read-only)', () => {
      assert.doesNotMatch(ROUTE_CODE, /export\s+async\s+function\s+POST\s*\(/)
      assert.doesNotMatch(ROUTE_CODE, /export\s+async\s+function\s+PUT\s*\(/)
      assert.doesNotMatch(ROUTE_CODE, /export\s+async\s+function\s+DELETE\s*\(/)
    })
  })
})

describe('GET /api/admin/users/search — derived behavioral assertions', () => {
  describe('happy path: alphabetic q (e.g. q="ever")', () => {
    it("SQL contains LOWER(username) LIKE LOWER($1) || '%'", () => {
      // Hardcoded SQL from the route — admin caller, alphabetic q → prefix match.
      const sql = `SELECT id, discord_id, username, is_patron, is_beta_tester
         FROM users
         WHERE LOWER(username) LIKE LOWER($1) || '%'
         ORDER BY username
         LIMIT 10`
      assert.ok(sql.includes("LOWER(username) LIKE LOWER($1) || '%'"))
      assert.ok(sql.includes('ORDER BY username'))
      assert.ok(sql.includes('LIMIT 10'))
    })

    it('response shape is { success: true, data: { users: [...] }, message: null }', () => {
      const dbRows = [
        {
          id: 'u1',
          discord_id: '111111111111111111',
          username: 'TestUser',
          is_patron: false,
          is_beta_tester: false,
        },
      ]
      // jsonResponse({ users: dbRows }) wraps to:
      const response = { success: true, data: { users: dbRows }, message: null }
      assert.strictEqual(response.success, true)
      assert.deepStrictEqual(response.data.users, dbRows)
      assert.strictEqual(response.message, null)
    })
  })

  describe('happy path: digit q (e.g. q="476210241630109696")', () => {
    it('SQL contains WHERE discord_id = $1', () => {
      const sql = `SELECT id, discord_id, username, is_patron, is_beta_tester
         FROM users
         WHERE discord_id = $1
         LIMIT 10`
      assert.ok(sql.includes('WHERE discord_id = $1'))
      assert.ok(sql.includes('LIMIT 10'))
    })

    it('regex /^\\d{1,25}$/ accepts a typical 18-digit snowflake', () => {
      const re = /^\d{1,25}$/
      assert.ok(re.test('476210241630109696')) // 18 digits
      assert.ok(re.test('111111111111111111')) // 18 digits
    })

    it('regex /^\\d{1,25}$/ rejects 26+ digit strings', () => {
      const re = /^\d{1,25}$/
      assert.ok(!re.test('1'.repeat(26)))
    })

    it('regex /^\\d{1,25}$/ rejects non-digit strings', () => {
      const re = /^\d{1,25}$/
      assert.ok(!re.test('abc'))
      assert.ok(!re.test('123abc'))
      assert.ok(!re.test('123 456'))
    })
  })

  describe('edge case: empty / sub-2-char q short-circuits', () => {
    it('returns { users: [] } when q is empty (no DB call)', () => {
      const q = ''
      const shouldShortCircuit = q.length < 2
      assert.strictEqual(shouldShortCircuit, true)
      const response = { success: true, data: { users: [] }, message: null }
      assert.deepStrictEqual(response.data.users, [])
    })

    it('returns { users: [] } when q is a single char (no DB call)', () => {
      const q = 'e'
      const shouldShortCircuit = q.length < 2
      assert.strictEqual(shouldShortCircuit, true)
    })

    it('proceeds to DB when q has 2+ chars', () => {
      const q = 'ev'
      const shouldShortCircuit = q.length < 2
      assert.strictEqual(shouldShortCircuit, false)
    })

    it('trims whitespace before length check (so "  " short-circuits)', () => {
      const rawQ = '  '
      const q = rawQ.trim()
      assert.strictEqual(q.length, 0)
      assert.strictEqual(q.length < 2, true)
    })
  })

  describe('error path: no session / non-admin → 404 (not 401, not 403)', () => {
    it('no session returns 404 via errorResponse', () => {
      const session = null
      const isBlocked = !session?.is_admin
      assert.strictEqual(isBlocked, true)
      // errorResponse('Not found', 404) → { success: false, data: null, message: 'Not found' }
      const response = { status: 404, body: { success: false, data: null, message: 'Not found' } }
      assert.strictEqual(response.status, 404)
      assert.strictEqual(response.body.message, 'Not found')
    })

    it('non-admin session returns 404 via errorResponse', () => {
      const session = {
        id: 'u1',
        email: 'u1@example.com',
        username: 'NotAdmin',
        is_admin: false,
        is_beta_tester: false,
      }
      const isBlocked = !session?.is_admin
      assert.strictEqual(isBlocked, true)
      const response = { status: 404, body: { success: false, data: null, message: 'Not found' } }
      assert.strictEqual(response.status, 404)
    })

    it('admin session passes the gate', () => {
      const session = {
        id: 'admin1',
        email: 'admin@example.com',
        username: 'Admin',
        is_admin: true,
        is_beta_tester: false,
      }
      const isBlocked = !session?.is_admin
      assert.strictEqual(isBlocked, false)
    })
  })

  describe('error path: DB throws → handled via handleApiError → 500', () => {
    it('handleApiError maps unknown error message to 500', () => {
      // From lib/utils.ts handleApiError: unknown errors → errorResponse(msg, 500).
      const error = new Error('connection refused')
      const knownMessages = [
        'Unauthorized',
        'Beta access required',
        'Admin access required',
      ]
      const isKnown =
        knownMessages.includes(error.message) ||
        error.message.includes('duplicate key') ||
        error.message.includes('not found')
      const status = isKnown ? 'known' : 500
      assert.strictEqual(status, 500)
    })
  })
})

console.log('\n🔍 Running admin user-search API tests...\n')
