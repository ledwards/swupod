import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const SOURCE = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

describe('/draft page pod creation', () => {
  it('creates the pod in place for the chosen set with the picked mode and visibility', () => {
    assert.match(SOURCE, /createDraft\(chosen, \{ isPublic, competitive, flowId \}\)/)
    assert.match(SOURCE, /router\.push\(`\/draft\/\$\{result\.shareId\}`\)/)
  })

  it('offers Public and Private visibility and remembers the choice', () => {
    assert.match(SOURCE, />Public<\/button>/)
    assert.match(SOURCE, />Private<\/button>/)
    assert.match(SOURCE, /localStorage\.setItem\('pod-visibility'/)
  })

  it('returns unauthenticated create-draft users to the standard draft URL after login', () => {
    assert.match(SOURCE, /encodeURIComponent\(STANDARD_DRAFT_NEW_PATH\)/)
  })
})
