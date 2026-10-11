// Which draft routes a signed-out solo drafter (guest) may use.
// SPEC: "You don't need to Discord login to solo draft" — but pods with other
// humans (create, join, settings, hosting tools) still need a login.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('guest solo draft route access', () => {
  it('the solo flow routes accept a guest', () => {
    for (const route of ['start', 'begin-picking', 'ready', 'select', 'confirm', 'pick', 'pool', 'trigger-bots', 'pause']) {
      const s = src(`./[shareId]/${route}/route.ts`)
      assert.match(s, /const session = requireDraftSession\(request\)/, route)
      assert.doesNotMatch(s, /requireAuth\(/, route)
    }
    assert.match(src('./[shareId]/route.ts'), /const session = getDraftSession\(request\)/)
    assert.match(src('./[shareId]/state/route.ts'), /const session = getDraftSession\(request\)/)
  })

  it('joining, settings and the other host tools still need a Discord login', () => {
    for (const route of ['join', 'settings', 'randomize', 'randomize-packs', 'drop', 'remove', 'leave']) {
      const s = src(`./[shareId]/${route}/route.ts`)
      assert.match(s, /requireAuth\(request\)/, route)
      assert.doesNotMatch(s, /requireDraftSession|getDraftSession|getGuestSession/, route)
    }
  })

  it('only the pod host adds bots', () => {
    const s = src('./[shareId]/dev/add-bots/route.ts')
    assert.match(s, /const session = requireDraftSession\(request\)/)
    assert.match(s, /if \(pod\.host_id !== session\.id\) \{\n\s+return errorResponse\('Only the host can add bots', 403\)/)
  })

  it('the deck-state beacon checks pool ownership like PUT /api/pools/:shareId', () => {
    const s = src('../pools/save-state/route.ts')
    assert.match(s, /if \(pool\.user_id !== null\) \{\n\s+const session = requireDraftSession\(request\)\n\s+if \(pool\.user_id !== session\.id\)/)
  })

  it('POST /api/draft only falls back to a guest for a solo request', () => {
    const s = src('./route.ts')
    assert.match(s, /if \(!session\) \{\n\s+if \(!isGuestSoloDraftRequest\(body\)\) throw new Error\('Unauthorized'\)/)
    assert.match(s, /setGuestCookie\(response, newGuestId\)/)
  })
})
