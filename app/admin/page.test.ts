// Tests for /admin page component structure
// Spec-search style: assert imports, gate logic, and render shape by reading
// the page file's source text. No real DB, no React render.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PAGE_PATH = join(__dirname, 'page.tsx')
const pageSource = readFileSync(PAGE_PATH, 'utf8')

describe('/admin page', () => {
  describe('Imports', () => {
    it('imports cookies from next/headers', () => {
      assert.ok(
        /import\s*\{[^}]*\bcookies\b[^}]*\}\s*from\s*['"]next\/headers['"]/.test(pageSource),
        'Page must import cookies from next/headers'
      )
    })

    it('imports notFound from next/navigation', () => {
      assert.ok(
        /import\s*\{[^}]*\bnotFound\b[^}]*\}\s*from\s*['"]next\/navigation['"]/.test(pageSource),
        'Page must import notFound from next/navigation'
      )
    })

    it('imports verifyToken from @/lib/auth', () => {
      assert.ok(
        /import\s*\{[^}]*\bverifyToken\b[^}]*\}\s*from\s*['"]@\/lib\/auth['"]/.test(pageSource),
        'Page must import verifyToken from @/lib/auth'
      )
    })

    it('imports AdminGrantPanel from @/src/components/admin/AdminGrantPanel', () => {
      assert.ok(
        /from\s*['"]@\/src\/components\/admin\/AdminGrantPanel['"]/.test(pageSource),
        'Page must import AdminGrantPanel from @/src/components/admin/AdminGrantPanel'
      )
    })
  })

  describe('Server component shape', () => {
    it('default export is an async function', () => {
      assert.ok(
        /^export default async function/m.test(pageSource),
        'Default export must be an async function (Next 16 cookies() returns a Promise)'
      )
    })

    it('does NOT include "use client" directive', () => {
      assert.ok(
        !pageSource.includes("'use client'"),
        'Admin page must remain a server component — no "use client" directive'
      )
      assert.ok(
        !pageSource.includes('"use client"'),
        'Admin page must remain a server component — no "use client" directive'
      )
    })

    it('awaits cookies() before reading the session token', () => {
      assert.ok(
        /await\s+cookies\(\)/.test(pageSource),
        'Page must await cookies() since Next 16 returns a Promise<ReadonlyRequestCookies>'
      )
    })

    it('reads the swupod_session cookie value', () => {
      assert.ok(
        pageSource.includes("'swupod_session'") || pageSource.includes('"swupod_session"'),
        'Page must read the swupod_session cookie'
      )
    })
  })

  describe('Admin gate', () => {
    it('uses !session?.is_admin to gate access', () => {
      assert.ok(
        pageSource.includes('!session?.is_admin'),
        'Gate must use !session?.is_admin (covers empty session AND non-admin session)'
      )
    })

    it("emits console.warn('admin-page-blocked' debug log for self-locked-out debugging", () => {
      assert.ok(
        pageSource.includes("console.warn('admin-page-blocked'"),
        'Page must emit console.warn(\'admin-page-blocked\' so Railway log grep surfaces blocked visits'
      )
    })

    it('calls notFound() to render the 404 surface', () => {
      assert.ok(
        /notFound\(\)/.test(pageSource),
        'Page must call notFound() — renders app/not-found.tsx with HTTP 404 (R1 stealth)'
      )
    })

    it('emits the admin-page-blocked log BEFORE calling notFound()', () => {
      const warnIndex = pageSource.indexOf("console.warn('admin-page-blocked'")
      const notFoundIndex = pageSource.indexOf('notFound()')
      assert.ok(warnIndex !== -1, 'admin-page-blocked log must exist')
      assert.ok(notFoundIndex !== -1, 'notFound() call must exist')
      assert.ok(
        warnIndex < notFoundIndex,
        'admin-page-blocked log must fire BEFORE notFound() so the log line is reachable'
      )
    })
  })

  describe('Rendered output', () => {
    it('renders <AdminGrantPanel /> for admin sessions', () => {
      assert.ok(
        pageSource.includes('<AdminGrantPanel'),
        'Admin-only render must be <AdminGrantPanel /> (U4)'
      )
    })

    it('renders AdminGrantPanel as the only child — no nav/chrome leakage', () => {
      // Scope-control: the only JSX tag in the rendered output should be AdminGrantPanel.
      // Count JSX-opening tags that look like components (<Capitalized) or HTML elements
      // in the return statement region.
      const returnMatch = pageSource.match(/return\s*\(?\s*(<[\s\S]*?>)/)
      const tagMatches = pageSource.match(/<[A-Z][A-Za-z0-9]*/g) || []
      // Should be exactly one capitalized component tag: <AdminGrantPanel
      assert.strictEqual(
        tagMatches.length,
        1,
        `Page should render exactly one component (AdminGrantPanel), found ${tagMatches.length}: ${tagMatches.join(', ')}`
      )
      assert.strictEqual(tagMatches[0], '<AdminGrantPanel')
      assert.ok(returnMatch, 'Page must have a return statement rendering JSX')
    })
  })

  describe('Session handling', () => {
    it('passes the cookie token to verifyToken', () => {
      assert.ok(
        /verifyToken\s*\(\s*token\s*\)/.test(pageSource),
        'Page must pass the cookie token to verifyToken'
      )
    })

    it('guards verifyToken against a missing token', () => {
      // Either `token ? verifyToken(token) : null` or equivalent short-circuit.
      assert.ok(
        /token\s*\?\s*verifyToken\(token\)\s*:\s*null/.test(pageSource) ||
          /if\s*\(\s*!?token\s*\)/.test(pageSource),
        'Page must guard verifyToken against an undefined token (no token => null session)'
      )
    })
  })
})

console.log('\n📄 Running admin page tests...\n')
