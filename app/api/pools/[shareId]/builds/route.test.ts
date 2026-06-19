import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROUTE_SRC = readFileSync(join(__dirname, 'route.ts'), 'utf8')

describe('GET /api/pools/[shareId]/builds', () => {
  it('selects and returns W-L-D record columns for root and child builds', () => {
    assert.match(ROUTE_SRC, /cp\.wins, cp\.losses, cp\.draws/)
    assert.match(ROUTE_SRC, /wins: root\.wins \?\? 0/)
    assert.match(ROUTE_SRC, /wins: b\.wins \?\? 0/)
  })
})
