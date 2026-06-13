// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const LUCK_SECTION_SRC = readFileSync(join(__dirname, 'LuckSection.tsx'), 'utf8')
const INDEX_SRC = readFileSync(join(__dirname, 'index.tsx'), 'utf8')

describe('<LuckSection /> beta set tabs', () => {
  it('uses the shared stats set tab registry', () => {
    assert.match(LUCK_SECTION_SRC, /getStatsSetTabs/)
    assert.match(LUCK_SECTION_SRC, /setTabs\.map/)
  })

  it('accepts includeBetaSets from the parent', () => {
    assert.match(LUCK_SECTION_SRC, /includeBetaSets\s*=\s*false/)
    assert.match(INDEX_SRC, /includeBetaSets=\{Boolean\(user\?\.is_beta_tester\s*\|\|\s*user\?\.is_admin\)\}/)
  })
})
