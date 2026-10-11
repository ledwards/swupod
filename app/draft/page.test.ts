import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const SOURCE = readFileSync(new URL('./DraftLanding.tsx', import.meta.url), 'utf8')

describe('/draft alpha landing pod creation', () => {
  it('creates the pod in place for the chosen set with the picked mode and visibility', () => {
    assert.match(SOURCE, /createDraft\(chosen, \{ isPublic, competitive, flowId, settings: \{ afterDraft, emptySeats \} \}\)/)
    assert.match(SOURCE, /router\.push\(`\/draft\/\$\{result\.shareId\}`\)/)
  })

  it('offers a Public switch and remembers the choice', () => {
    assert.match(SOURCE, /checked=\{isPublic\} onChange=\{e => chooseVisibility\(e\.target\.checked\)\}/)
    assert.match(SOURCE, /<span>Public<\/span>/)
    assert.match(SOURCE, /localStorage\.setItem\('pod-visibility'/)
  })

  it('returns unauthenticated create-draft users to the standard draft URL after login', () => {
    assert.match(SOURCE, /<DiscordLoginButton returnTo=\{STANDARD_DRAFT_NEW_PATH\} \/>/)
  })

  it('uses the standard Discord login button, never a hand-rolled one', () => {
    assert.match(SOURCE, /import DiscordLoginButton from '..\/..\/src\/components\/DiscordLoginButton'/)
    assert.doesNotMatch(SOURCE, /Log ?in with Discord/i)
    assert.doesNotMatch(SOURCE, /api\/auth\/signin\/discord/)
  })

  it('starts a solo draft without a login', () => {
    const solo = SOURCE.slice(SOURCE.indexOf('aria-label="Solo draft"'), SOURCE.indexOf('const createPodPanel'))
    assert.match(solo, /onClick=\{\(\) => void startSolo\(\)\}/)
    assert.doesNotMatch(solo, /isAuthenticated|DiscordLoginButton/)
  })

  it('puts sets and Solo Draft on the left, Join a Pod and Create a Pod together on the right', () => {
    const left = SOURCE.slice(SOURCE.indexOf('const left = ('), SOURCE.indexOf('const createPodPanel'))
    assert.ok(left.indexOf('sp-setgrid') < left.indexOf('aria-label="Solo draft"'))
    assert.doesNotMatch(left, /Create a Pod|draft-start-or/)
    assert.match(SOURCE, /<aside>\{pods\}\{createPodPanel\}/)
    assert.doesNotMatch(SOURCE, />OR</)
  })
})
