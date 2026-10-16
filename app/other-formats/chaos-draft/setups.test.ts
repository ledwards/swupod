// SPEC (Workstream B2): one Chaos Draft setup with Who's playing? Practice Solo (create a solo
// chaos pod, add 7 bots, start) / With Other Players (chaos pod with Public/Private, empty-seat
// bots and the After-the-draft choice); sign-in happens on the primary, never on page load.
// Chaos Sealed ships Practice Solo; With Other Players is visibly coming soon.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const DRAFT = readFileSync(new URL('./ChaosDraftSetup.tsx', import.meta.url), 'utf8')
const SEALED = readFileSync(new URL('../chaos-sealed/ChaosSealedSetup.tsx', import.meta.url), 'utf8')

describe('alpha Chaos Draft setup', () => {
  it('Practice Solo creates a private solo chaos pod, seats 7 bots and starts it', () => {
    assert.match(DRAFT, /isPublic: solo \? false : isPublic/)
    assert.match(DRAFT, /\{ isSolo: true, draftMode: 'chaos', chaosSets \}/)
    assert.match(DRAFT, /\/dev\/add-bots\?count=7/)
    assert.match(DRAFT, /await startDraft\(pod\.shareId\)/)
  })

  it('With Other Players creates a chaos pod with the pod options', () => {
    assert.match(DRAFT, /\{ draftMode: 'chaos', chaosSets, afterDraft, emptySeats \}/)
    assert.match(DRAFT, /AFTER_DRAFT_CHOICES\.map/)
    assert.match(DRAFT, /localStorage\.setItem\('pod-visibility'/)
  })

  it('sends the packs in summary order', () => {
    assert.match(DRAFT, /const chaosSets = summary\.ordered/)
  })

  it('asks for sign-in on the primary with the standard Discord button, not on load', () => {
    assert.match(DRAFT, /<DiscordLoginButton className="entry-go" returnTo=\{returnTo\}/)
    assert.doesNotMatch(DRAFT, /api\/auth\/signin\/discord/)
    assert.doesNotMatch(DRAFT, /router\.(push|replace)\([^)]*signin/)
  })

  it('never renders the shared multi-select PackSelector', () => {
    assert.doesNotMatch(DRAFT, /PackSelector/)
    assert.doesNotMatch(SEALED, /PackSelector/)
  })
})

describe('alpha Chaos Sealed setup', () => {
  it('opens a solo chaos pool from the summary order, signed out allowed', () => {
    assert.match(SEALED, /fetch\('\/api\/formats\/chaos-sealed'/)
    assert.match(SEALED, /setCodes: summary\.ordered/)
    assert.doesNotMatch(SEALED, /DiscordLoginButton|isAuthenticated/)
  })

  it('shows With Other Players as a disabled, coming-soon option', () => {
    assert.match(SEALED, /disabled aria-describedby="cpk-sealed-soon">\s*With Other Players<span id="cpk-sealed-soon">Coming soon/)
  })
})
