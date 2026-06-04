// @ts-nocheck
/**
 * Spec tests for POST /api/admin/grant.
 *
 * Pattern (mirrors app/api/admin/users/search/route.test.ts): we read the
 * route file as a string, strip comments so substring assertions reflect
 * runtime behavior rather than commentary, and assert on SQL substrings,
 * validation guards, response shape, and the absence of forbidden helpers.
 *
 * The route file also exports LOG_PREFIX_ADMIN_GRANT as a constant; we
 * import it so prefix drift breaks this test rather than silently changing
 * the Railway log-grep contract.
 *
 * Run: node --import tsx/esm app/api/admin/grant/route.test.ts
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { LOG_PREFIX_ADMIN_GRANT } from './route'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROUTE_PATH = join(__dirname, 'route.ts')
const ROUTE_SOURCE = readFileSync(ROUTE_PATH, 'utf8')

// Strip line/block comments so substring assertions are about runtime behavior,
// not commentary. (e.g. a header comment that says "we do NOT use requireAdmin"
// would false-positive a naive search for "requireAdmin".)
function stripComments(src) {
  // Remove block comments
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  // Remove line comments (preserve a leading non-colon char so :// in URLs is safe)
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  return out
}
const ROUTE_CODE = stripComments(ROUTE_SOURCE)

describe('POST /api/admin/grant — route file spec', () => {
  describe('log prefix pin (Railway audit grep contract)', () => {
    it("exports LOG_PREFIX_ADMIN_GRANT === 'admin-grant'", () => {
      // Railway log grep on `admin-grant` depends on this exact value.
      assert.equal(LOG_PREFIX_ADMIN_GRANT, 'admin-grant')
    })

    it('declares the prefix as a top-of-file exported constant', () => {
      // Pinned literally in the source so a rename has to touch this file too.
      assert.match(
        ROUTE_CODE,
        /export\s+const\s+LOG_PREFIX_ADMIN_GRANT\s*=\s*['"]admin-grant['"]/
      )
    })

    it('audit log call references the pinned constant, not a string literal', () => {
      // console.log(LOG_PREFIX_ADMIN_GRANT, { ... }) — the test would be
      // pointless if the code re-introduced a literal at the call site.
      assert.match(ROUTE_CODE, /console\.log\(\s*LOG_PREFIX_ADMIN_GRANT\b/)
    })
  })

  describe('admin gate (404 stealth, R5)', () => {
    it('imports getSession from @/lib/auth', () => {
      assert.match(
        ROUTE_CODE,
        /import\s*\{[^}]*\bgetSession\b[^}]*\}\s*from\s*['"]@\/lib\/auth['"]/
      )
    })

    it('does NOT import or call requireAdmin (would map to 403 via handleApiError)', () => {
      // The helper throws Error('Admin access required') which handleApiError
      // maps to 403 — incompatible with R5's 404-stealth.
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

    it('admin gate runs BEFORE any body parsing / input validation', () => {
      // getSession(request) must precede request.json() so non-admins never
      // even reach the body-parse path. Matches U1's pattern.
      const getSessionIdx = ROUTE_CODE.indexOf('getSession(request)')
      const bodyReadIdx = ROUTE_CODE.indexOf('request.json()')
      assert.ok(getSessionIdx > -1, 'expected getSession(request) in route')
      assert.ok(bodyReadIdx > -1, 'expected request.json() in route')
      assert.ok(
        getSessionIdx < bodyReadIdx,
        'admin gate must run before body parsing for 404-stealth'
      )
    })

    it('admin gate appears outside the try/catch (so DB errors do not mask 404)', () => {
      // The admin-gate return must precede the try block so non-admins
      // never even enter the DB-error handling path.
      const getSessionIdx = ROUTE_CODE.indexOf('getSession(request)')
      const tryIdx = ROUTE_CODE.indexOf('try {')
      assert.ok(getSessionIdx > -1)
      assert.ok(tryIdx > -1)
      assert.ok(getSessionIdx < tryIdx, 'admin gate must run before try block')
    })
  })

  describe('flag allowlist mechanic (SQL-injection guard)', () => {
    it("declares ALLOWED_FLAGS as a const tuple of 'is_patron' and 'is_beta_tester'", () => {
      assert.match(
        ROUTE_CODE,
        /const\s+ALLOWED_FLAGS\s*=\s*\[\s*['"]is_patron['"]\s*,\s*['"]is_beta_tester['"]\s*\]\s*as\s+const/
      )
    })

    it("typeof-guards flag as string (rejects boxed strings, arrays, toString-objects)", () => {
      // Boxed String, arrays, and objects with custom toString all fail
      // `typeof === 'string'`. This is the first line of defense.
      assert.match(ROUTE_CODE, /typeof\s+flag\s*!==\s*['"]string['"]/)
    })

    it('re-extracts safeFlag from ALLOWED_FLAGS via .find (not the raw input)', () => {
      // The critical pattern: find the matched value from ALLOWED_FLAGS and
      // use THAT in the SQL string. Case-twist like 'IS_PATRON' returns
      // undefined from .find and is rejected.
      assert.match(
        ROUTE_CODE,
        /const\s+safeFlag\s*=\s*ALLOWED_FLAGS\.find\(\s*f\s*=>\s*f\s*===\s*flag\s*\)/
      )
    })

    it("rejects an unmatched flag with errorResponse('Invalid flag', 400)", () => {
      assert.match(
        ROUTE_CODE,
        /errorResponse\(\s*['"]Invalid flag['"]\s*,\s*400\s*\)/
      )
    })

    it('interpolates ${safeFlag} into the SQL (and never the raw flag)', () => {
      // safeFlag is the value re-extracted from the const tuple. The raw
      // `flag` from body must never appear inside the SQL template.
      assert.match(ROUTE_CODE, /\$\{safeFlag\}/)
      assert.doesNotMatch(ROUTE_CODE, /\$\{flag\}/)
    })
  })

  describe('discordId validation', () => {
    it('typeof-guards discordId as string', () => {
      assert.match(ROUTE_CODE, /typeof\s+discordId\s*!==\s*['"]string['"]/)
    })

    it('validates discordId via /^\\d{17,25}$/', () => {
      // 17–19 digit Discord snowflakes, with room up to 25 for future
      // growth. Caps resource-exhaustion risk from giant strings and
      // keeps junk rows out of users.
      assert.match(ROUTE_CODE, /\/\^\\d\{17,25\}\$\//)
    })

    it("rejects an invalid discordId with errorResponse('Invalid discordId', 400)", () => {
      assert.match(
        ROUTE_CODE,
        /errorResponse\(\s*['"]Invalid discordId['"]\s*,\s*400\s*\)/
      )
    })
  })

  describe('SELECT-then-UPSERT pattern (correct preProvisioned under concurrency)', () => {
    it('SELECT id FROM users WHERE discord_id = $1 runs before the upsert', () => {
      // The precheck is what makes `preProvisioned` correct under concurrent
      // inserts (per KTD; xmax = 0 can lie under OAuth-callback races).
      assert.match(
        ROUTE_CODE,
        /SELECT\s+id\s+FROM\s+users\s+WHERE\s+discord_id\s*=\s*\$1/
      )
    })

    it('derives preProvisioned = !existing from the precheck', () => {
      assert.match(ROUTE_CODE, /const\s+preProvisioned\s*=\s*!existing/)
    })

    it('upsert template: INSERT INTO users (discord_id, username, ${safeFlag}) VALUES ($1, $2, TRUE)', () => {
      assert.match(
        ROUTE_CODE,
        /INSERT INTO users \(discord_id, username, \$\{safeFlag\}\) VALUES \(\$1, \$2, TRUE\)/
      )
    })

    it('upsert conflict clause: ON CONFLICT (discord_id) DO UPDATE SET ${safeFlag} = TRUE', () => {
      // Idempotent upsert. Mirrors add-bots route precedent.
      assert.match(
        ROUTE_CODE,
        /ON CONFLICT \(discord_id\) DO UPDATE SET \$\{safeFlag\} = TRUE/
      )
    })

    it('upsert SELECT runs before INSERT in source order (precheck → write)', () => {
      const selectIdx = ROUTE_CODE.indexOf('SELECT id FROM users WHERE discord_id = $1')
      const insertIdx = ROUTE_CODE.indexOf('INSERT INTO users (discord_id, username, ${safeFlag})')
      assert.ok(selectIdx > -1)
      assert.ok(insertIdx > -1)
      assert.ok(selectIdx < insertIdx, 'SELECT precheck must precede the INSERT write')
    })

    it('username param defaults to discordId when omitted (username ?? discordId)', () => {
      // Placeholder username gets overwritten by the OAuth callback on
      // first sign-in; no need to require a username from the admin.
      assert.match(ROUTE_CODE, /username\s*\?\?\s*discordId/)
    })

    it('reads back the canonical user row after the upsert', () => {
      // Response.user comes from this read-back, not from INSERT RETURNING,
      // so the response shape is consistent across both insert and update
      // branches.
      assert.match(
        ROUTE_CODE,
        /SELECT\s+id,\s+discord_id,\s+username,\s+email,\s+is_patron,\s+is_beta_tester\s+FROM\s+users\s+WHERE\s+discord_id\s*=\s*\$1/
      )
    })
  })

  describe('R7: one flag per request (granting patron must not also set beta, and vice versa)', () => {
    it('does NOT set both is_patron and is_beta_tester in the same statement', () => {
      // The exact dual-set substrings must never appear. The upsert uses
      // only ${safeFlag} — the column is server-controlled and singular.
      assert.doesNotMatch(ROUTE_CODE, /is_patron,\s*is_beta_tester\s*=\s*TRUE/i)
      assert.doesNotMatch(ROUTE_CODE, /is_beta_tester,\s*is_patron\s*=\s*TRUE/i)
    })

    it('the INSERT/UPDATE SQL statement names neither flag column as a literal (only ${safeFlag})', () => {
      // The only template-literal SQL in the file is the INSERT/ON CONFLICT
      // upsert. It must reference its target column ONLY via ${safeFlag}.
      // Literal flag column names there would defeat R7.
      const templateLiterals = ROUTE_CODE.match(/`[^`]*`/g) ?? []
      const sqlLiterals = templateLiterals.filter(
        s => /INSERT|UPDATE/i.test(s)
      )
      assert.ok(sqlLiterals.length > 0, 'expected at least one INSERT/UPDATE template literal')
      for (const sql of sqlLiterals) {
        assert.doesNotMatch(
          sql,
          /\bis_patron\b/,
          `INSERT/UPDATE SQL must not name is_patron literally: ${sql}`
        )
        assert.doesNotMatch(
          sql,
          /\bis_beta_tester\b/,
          `INSERT/UPDATE SQL must not name is_beta_tester literally: ${sql}`
        )
      }
    })
  })

  describe('audit log shape (Railway grep contract)', () => {
    it('logs adminId, flag (safeFlag), targetDiscordId, targetUserId, preProvisioned', () => {
      // Pinned shape for Railway log grep. Key presence is asserted to
      // catch silent drops; order doesn't matter to grep.
      assert.match(ROUTE_CODE, /adminId:\s*session\.id/)
      assert.match(ROUTE_CODE, /flag:\s*safeFlag/)
      assert.match(ROUTE_CODE, /targetDiscordId:\s*discordId/)
      assert.match(ROUTE_CODE, /targetUserId/)
      assert.match(ROUTE_CODE, /preProvisioned/)
    })
  })

  describe('response shape', () => {
    it('returns jsonResponse({ user, preProvisioned })', () => {
      assert.match(
        ROUTE_CODE,
        /jsonResponse\(\s*\{\s*user,\s*preProvisioned\s*\}\s*\)/
      )
    })
  })

  describe('imports & wiring', () => {
    it('imports query and queryRow from @/lib/db', () => {
      assert.match(
        ROUTE_CODE,
        /import\s*\{[^}]*\bquery\b[^}]*\}\s*from\s*['"]@\/lib\/db['"]/
      )
      assert.match(
        ROUTE_CODE,
        /import\s*\{[^}]*\bqueryRow\b[^}]*\}\s*from\s*['"]@\/lib\/db['"]/
      )
    })

    it('imports jsonResponse, errorResponse, and handleApiError from @/lib/utils', () => {
      assert.match(
        ROUTE_CODE,
        /import\s*\{[^}]*\bjsonResponse\b[^}]*\}\s*from\s*['"]@\/lib\/utils['"]/
      )
      assert.match(
        ROUTE_CODE,
        /import\s*\{[^}]*\berrorResponse\b[^}]*\}\s*from\s*['"]@\/lib\/utils['"]/
      )
      assert.match(
        ROUTE_CODE,
        /import\s*\{[^}]*\bhandleApiError\b[^}]*\}\s*from\s*['"]@\/lib\/utils['"]/
      )
    })

    it('funnels thrown errors through handleApiError', () => {
      // DB errors (SELECT throw, upsert throw) flow through handleApiError
      // → 500 envelope. The admin gate runs BEFORE the try, so a missing
      // session still 404s rather than 500ing.
      assert.match(ROUTE_CODE, /return\s+handleApiError\(\s*error\s*\)/)
    })
  })

  describe('body parse defensiveness', () => {
    it('tolerates a missing or unparseable JSON body (catch → empty object)', () => {
      // Without this, a request with no body throws before the flag/discordId
      // guards run, and the user sees a 500 instead of a clean 400.
      assert.match(
        ROUTE_CODE,
        /request\.json\(\)\s*\.catch\(\s*\(\s*\)\s*=>\s*\(\s*\{\s*\}\s*\)\s*\)/
      )
    })
  })
})

console.log('\n🛡️  Running admin grant API tests...\n')
