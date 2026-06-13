// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PAGE_SRC = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

describe('/stats page tabs', () => {
  it('uses the shared stats tab registry with beta access', () => {
    assert.match(PAGE_SRC, /getStatsTabs\(hasBetaSetAccess\)/)
    assert.match(PAGE_SRC, /user\?\.is_beta_tester\s*\|\|\s*user\?\.is_admin/)
  })

  it('uses the shared set color map for tab styling', () => {
    assert.match(PAGE_SRC, /STATS_SET_COLORS\[tab\]/)
  })
})
