// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const LUCK_SECTION_SRC = readFileSync(join(__dirname, 'LuckSection.tsx'), 'utf8')

describe('<LuckSection /> luck request scope', () => {
  // BUG: the luck request was scoped to the parent era's since/until window.
  // "How lucky were my packs of set X" is a property of the SET, not the era,
  // so a narrow Range (or the forward-looking ASH era) reported "no packs
  // opened" even when the user had opened plenty. The request must be scoped by
  // set + scope only, all-time.
  it('FIXED: scopes the luck request by set, not the era date window', () => {
    const paramsLine = LUCK_SECTION_SRC.match(/new URLSearchParams\(\{[\s\S]*?\}\)/)?.[0] || ''
    assert.ok(paramsLine.length > 0, 'expected a URLSearchParams() call for the luck request')
    assert.ok(/setCode/.test(paramsLine), 'luck request must still be scoped by setCode')
    assert.ok(
      !/\bsince\b/.test(paramsLine) && !/\buntil\b/.test(paramsLine),
      'luck request must NOT constrain by the era date window (since/until)'
    )
  })
})
