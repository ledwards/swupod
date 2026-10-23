// Keyframes are global, so an empty @keyframes overrides the real one with
// the same name anywhere on the site. An alpha/legacy merge left empty copies
// of pack-enter and card-fly behind, and every pack sat at opacity 0.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'
import fs from 'node:fs'

describe('stylesheets', () => {
  it('have no empty @keyframes', () => {
    const files = execSync("git ls-files '*.css'", { encoding: 'utf8' })
      .split('\n')
      .filter(f => f && !f.startsWith('public/'))
    const empties: string[] = []
    for (const file of files) {
      const css = fs.readFileSync(file, 'utf8')
      for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{\s*\}/g)) empties.push(`${file}: ${m[1]}`)
    }
    assert.deepStrictEqual(empties, [])
  })
})
