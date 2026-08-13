import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { openCompanionHandoffTab, companionPlatform, KARABAST_HOME_URL } from './companionTabHandoff'

/**
 * SPEC (2026-08-12 Safari dead-click): the one-click launches that must await a
 * server claim have to open their tab inside the click, because Safari discards
 * the page's transient user activation across that await and the Companion's
 * own window.open is then refused. Only the Safari Companion build gets this
 * treatment — everywhere else its background opens the tab, and a second tab
 * from here would be a bug.
 */

const g = globalThis as Record<string, unknown>
let opened: Array<[string, string]>
let fakeTab: { location: { href: string }; closed: boolean }

function setCompanionPlatform(platform: string | null): void {
  g.document = {
    querySelector: () => (platform == null ? null : { dataset: { platform } }),
  }
}

beforeEach(() => {
  opened = []
  fakeTab = { location: { href: 'about:blank' }, closed: false }
  g.window = {
    open: (url: string, target: string) => {
      opened.push([url, target])
      return fakeTab
    },
  }
})

afterEach(() => {
  delete g.window
  delete g.document
})

describe('openCompanionHandoffTab', () => {
  it('SPEC: opens the tab up front on the Safari Companion', () => {
    setCompanionPlatform('safari')
    const handoff = openCompanionHandoffTab()

    assert.ok(handoff, 'Safari must get a pre-opened tab')
    assert.deepEqual(opened, [['about:blank', '_blank']])

    handoff.navigate(KARABAST_HOME_URL)
    assert.equal(fakeTab.location.href, KARABAST_HOME_URL)
  })

  it('SPEC: Chrome and Firefox keep letting the Companion open the tab', () => {
    // Their background does the open, keyed to that tab's id. Opening one here
    // too would leave the user with a stray blank tab.
    for (const platform of ['chrome', 'firefox']) {
      setCompanionPlatform(platform)
      assert.equal(openCompanionHandoffTab(), null, `${platform} must not pre-open`)
    }
    assert.deepEqual(opened, [])
  })

  it('SPEC: a Companion too old to name its platform is left alone', () => {
    // No data-platform means a build that also ignores tabOpenedByPage — it
    // still opens the tab itself, so pre-opening would double up.
    setCompanionPlatform(null)
    assert.equal(openCompanionHandoffTab(), null)
    assert.equal(companionPlatform(), null)
  })

  it('handles a refused popup by falling back to no handoff', () => {
    setCompanionPlatform('safari')
    g.window = { open: () => null }
    assert.equal(openCompanionHandoffTab(), null)
  })

  it('close() disposes the tab when the claim launches nothing', () => {
    setCompanionPlatform('safari')
    const handoff = openCompanionHandoffTab()
    assert.ok(handoff)
    fakeTab.close = () => {
      fakeTab.closed = true
    }
    handoff.close()
    assert.equal(fakeTab.closed, true)
  })

  it('survives a tab the user closed mid-claim', () => {
    setCompanionPlatform('safari')
    const handoff = openCompanionHandoffTab()
    assert.ok(handoff)
    Object.defineProperty(fakeTab, 'location', {
      get() {
        throw new Error('tab is gone')
      },
    })
    assert.doesNotThrow(() => handoff.navigate(KARABAST_HOME_URL))
  })
})
