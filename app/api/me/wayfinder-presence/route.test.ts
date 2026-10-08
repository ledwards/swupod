import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROUTE_SRC = readFileSync(join(__dirname, 'route.ts'), 'utf8')

describe('GET /api/me/wayfinder-presence', () => {
  it('returns beta/admin access with the activity signal', () => {
    assert.match(ROUTE_SRC, /hasBetaAccess = Boolean\(session\.is_beta_tester \|\| session\.is_admin\)/)
    assert.match(ROUTE_SRC, /data: \{ hasActivity: Boolean\(row\?\.has_activity\), hasBetaAccess \}/)
  })

  it('does not grant beta access to unauthenticated users', () => {
    assert.match(ROUTE_SRC, /data: \{ hasActivity: false, hasBetaAccess: false \}/)
  })
})
