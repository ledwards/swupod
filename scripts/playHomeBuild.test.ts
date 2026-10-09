import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const build = JSON.parse(readFileSync(join(root, 'src/components/PlayHomepage/build.json'), 'utf8'))

describe('vendored Purrgil homepage bundle', () => {
  it('build.json revision matches the committed homepage.js (bundle and cache-buster in lockstep)', () => {
    const digest = createHash('sha256').update(readFileSync(join(root, 'public/play-home/homepage.js'))).digest('hex').slice(0, 16)
    assert.equal(build.revision, digest, 'Run `node scripts/sync-play-home.mjs <purrgil>` after rebuilding the bundle')
  })
  it('records the Purrgil commit the bundle was built from', () => {
    assert.match(String(build.purrgilCommit), /^[0-9a-f]{40}$/)
  })
})
