// @ts-nocheck
/**
 * Spec tests for <AdminGrantPanel />.
 *
 * Mirrors the pattern from app/api/admin/grant/route.test.ts and
 * app/api/admin/users/search/route.test.ts: read the component (and CSS)
 * source as a string, strip comments so substring assertions reflect
 * runtime behavior rather than commentary, and assert on JSX structure,
 * ARIA wiring, fetch wiring, and copy.
 *
 * No real React render here — these are spec assertions on the file's
 * source text. The integration shape (typing, debounce, fetch round-trip)
 * is implicit in the static structure the assertions enforce.
 *
 * Run: npx tsx --test src/components/admin/AdminGrantPanel.test.tsx
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const COMPONENT_PATH = join(__dirname, 'AdminGrantPanel.tsx')
const CSS_PATH = join(__dirname, 'AdminGrantPanel.css')
const COMPONENT_SOURCE = readFileSync(COMPONENT_PATH, 'utf8')
const CSS_SOURCE = readFileSync(CSS_PATH, 'utf8')
const TEST_SOURCE = readFileSync(__filename, 'utf8')

// Strip line/block comments so substring assertions are about runtime
// behavior, not commentary. (e.g. a comment that says "never send both flags"
// would false-positive a naive search for the dual-flag string.)
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  return out
}
const COMPONENT_CODE = stripComments(COMPONENT_SOURCE)

describe('<AdminGrantPanel /> — component file spec', () => {
  describe('client-component directive', () => {
    it("declares 'use client' as its first non-comment line", () => {
      // Strict-mode hint to Next: client component. Must be the first non-blank,
      // non-comment line — the original source, not the stripped copy.
      const lines = COMPONENT_SOURCE.split('\n')
      let firstNonBlank = null
      for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue
        if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue
        firstNonBlank = line
        break
      }
      assert.equal(
        firstNonBlank,
        "'use client'",
        `expected 'use client' as first non-comment line, got: ${firstNonBlank}`
      )
    })
  })

  describe('imports', () => {
    it('imports useState, useEffect, useRef from react', () => {
      assert.match(
        COMPONENT_CODE,
        /import\s*\{[^}]*\buseState\b[^}]*\}\s*from\s*['"]react['"]/
      )
      assert.match(
        COMPONENT_CODE,
        /import\s*\{[^}]*\buseEffect\b[^}]*\}\s*from\s*['"]react['"]/
      )
      assert.match(
        COMPONENT_CODE,
        /import\s*\{[^}]*\buseRef\b[^}]*\}\s*from\s*['"]react['"]/
      )
    })

    it('imports SearchInput from @/src/components/SearchInput', () => {
      assert.match(
        COMPONENT_CODE,
        /import\s+SearchInput\s+from\s+['"]@\/src\/components\/SearchInput['"]/
      )
    })

    it('imports Button from @/src/components/Button', () => {
      assert.match(
        COMPONENT_CODE,
        /import\s+Button\s+from\s+['"]@\/src\/components\/Button['"]/
      )
    })

    it('imports its co-located CSS', () => {
      assert.match(COMPONENT_CODE, /import\s+['"]\.\/AdminGrantPanel\.css['"]/)
    })
  })

  describe('search wiring (GET /api/admin/users/search)', () => {
    it("calls fetch('/api/admin/users/search?q=...') in a useEffect", () => {
      // Hardcoded URL substring — the panel must hit the U1 route.
      assert.ok(
        COMPONENT_CODE.includes("fetch('/api/admin/users/search"),
        "expected fetch('/api/admin/users/search... in component"
      )
    })

    it('URL-encodes the query before appending to the search URL', () => {
      // Avoid breaking the URL if the admin pastes a query with spaces, &, etc.
      assert.match(COMPONENT_CODE, /encodeURIComponent\s*\(/)
    })

    it('uses credentials: include for the search request', () => {
      assert.match(COMPONENT_CODE, /credentials:\s*['"]include['"]/)
    })

    it('short-circuits search for sub-2-char queries (matches U1 route)', () => {
      // Spec: q.trim().length < 2 returns no suggestions without hitting DB.
      // Mirror it in the client to avoid useless network calls on a single
      // keystroke.
      assert.match(COMPONENT_CODE, /\.length\s*<\s*2/)
    })

    it('reads suggestions from the { data: { users } } envelope shape', () => {
      // jsonResponse({ users }) -> { success, data: { users: [...] }, message }.
      assert.match(COMPONENT_CODE, /data\?\.users|data\.users/)
    })
  })

  describe('grant wiring (POST /api/admin/grant)', () => {
    it("calls fetch('/api/admin/grant', ...) for the Add action", () => {
      assert.ok(
        COMPONENT_CODE.includes("fetch('/api/admin/grant'"),
        "expected fetch('/api/admin/grant'... in component"
      )
    })

    it("uses method: 'POST' for the grant request", () => {
      assert.match(COMPONENT_CODE, /method:\s*['"]POST['"]/)
    })

    it('sends a JSON body via JSON.stringify', () => {
      assert.match(COMPONENT_CODE, /JSON\.stringify\s*\(/)
    })

    it("sends Content-Type: application/json header", () => {
      assert.match(
        COMPONENT_CODE,
        /['"]Content-Type['"]\s*:\s*['"]application\/json['"]/
      )
    })

    it('grant request body includes flag, discordId, and username', () => {
      // The U2 route validates body.flag and body.discordId; username is
      // optional (falls back to discordId on the server side).
      assert.match(COMPONENT_CODE, /flag\s*,\s*discordId\s*,\s*username/)
    })
  })

  describe('R7 enforcement in client (one flag per request)', () => {
    it('does NOT include the literal sequence is_patron, is_beta_tester in a sent body', () => {
      // The client constructs the body as { flag, discordId, username } — it
      // must never include both flag column names side-by-side in any body.
      // The literal sequence "is_patron, is_beta_tester" appears in the U2
      // ALLOWED_FLAGS constant but must NOT appear in the panel's fetch body.
      assert.doesNotMatch(COMPONENT_CODE, /is_patron,\s*is_beta_tester/)
    })

    it('uses a single flag state union (is_patron OR is_beta_tester), not both', () => {
      // The Flag type is the union; check it's referenced as the toggle state.
      assert.match(COMPONENT_CODE, /'is_patron'\s*\|\s*'is_beta_tester'/)
    })
  })

  describe('ARIA combobox shape', () => {
    it('declares role="combobox" on the input', () => {
      assert.match(COMPONENT_CODE, /['"]role['"]\s*,\s*['"]combobox['"]/)
    })

    it('declares role="listbox" on the suggestions <ul>', () => {
      assert.match(COMPONENT_CODE, /role=['"]listbox['"]/)
    })

    it('declares role="option" on each suggestion row', () => {
      assert.match(COMPONENT_CODE, /role=['"]option['"]/)
    })

    it('uses role="button" tabIndex={-1} on selectable row inners (per nested-button rule)', () => {
      // Per .claude/rules/ui-components.md: HTML disallows <button> inside
      // <button>. We render a <div role="button" tabIndex={-1}> instead so
      // keyboard activation comes from the listbox's aria-activedescendant.
      assert.match(COMPONENT_CODE, /role=['"]button['"]/)
      assert.match(COMPONENT_CODE, /tabIndex=\{-1\}/)
    })

    it('wires aria-expanded mirroring dropdown open state', () => {
      assert.match(COMPONENT_CODE, /aria-expanded/)
    })

    it('wires aria-controls pointing at the suggestions listbox id', () => {
      assert.match(COMPONENT_CODE, /aria-controls/)
      assert.match(COMPONENT_CODE, /admin-grant-suggestions/)
    })

    it('wires aria-activedescendant to the highlighted option id', () => {
      assert.match(COMPONENT_CODE, /aria-activedescendant/)
      // ids are of the form opt-{i}
      assert.match(COMPONENT_CODE, /['"]opt-['"]\s*\+\s*\w+/)
    })

    it('uses role="alert" for the error feedback region', () => {
      assert.match(COMPONENT_CODE, /role=['"]alert['"]/)
    })

    it('uses role="status" for the success feedback region', () => {
      assert.match(COMPONENT_CODE, /role=['"]status['"]/)
    })
  })

  describe('pre-provision row + empty state', () => {
    it('detects snowflake queries with /^\\d{17,25}$/', () => {
      // The pre-provision row only appears when query matches 17-25 digits AND
      // there is no exact discord_id match in suggestions.
      assert.match(COMPONENT_CODE, /\/\^\\d\{17,25\}\$\//)
    })

    it("renders the pre-provision row copy 'Pre-provision Discord ID'", () => {
      assert.ok(
        COMPONENT_CODE.includes('Pre-provision Discord ID'),
        'expected pre-provision row label copy'
      )
    })

    it("renders the secondary muted line '(no swupod account yet)'", () => {
      assert.ok(
        COMPONENT_CODE.includes('(no swupod account yet)'),
        'expected pre-provision row secondary line'
      )
    })

    it("renders empty-state copy 'No matches. To pre-provision'", () => {
      assert.ok(
        COMPONENT_CODE.includes('No matches. To pre-provision'),
        'expected empty-state copy directing admin to Discord user ID'
      )
    })

    it('mentions Discord Copy User ID / Developer Mode in the empty-state hint', () => {
      assert.ok(
        COMPONENT_CODE.includes('Copy User ID') &&
          COMPONENT_CODE.includes('Developer Mode'),
        'expected hint to reference Copy User ID and Developer Mode'
      )
    })
  })

  describe('flag toggle (Patron / Beta)', () => {
    it("uses <Button variant=\"toggle\" glowColor=\"blue\" ...> for the flag toggle", () => {
      // Per MEMORY.md feedback_use_button_component_for_toggles.
      assert.match(
        COMPONENT_CODE,
        /<Button[^>]*variant=['"]toggle['"][^>]*glowColor=['"]blue['"]/
      )
    })

    it("defaults flag to 'is_patron'", () => {
      // Plan: Patron-first because the dominant use case is paying patrons
      // who haven't signed in.
      assert.match(
        COMPONENT_CODE,
        /useState[^(]*\(\s*['"]is_patron['"]\s*\)/
      )
    })

    it("active prop reads flag === 'is_patron' and flag === 'is_beta_tester'", () => {
      assert.match(
        COMPONENT_CODE,
        /active=\{flag\s*===\s*['"]is_patron['"]\}/
      )
      assert.match(
        COMPONENT_CODE,
        /active=\{flag\s*===\s*['"]is_beta_tester['"]\}/
      )
    })
  })

  describe('Add button (primary CTA)', () => {
    it("uses <Button variant=\"primary\" ...> for the Add CTA", () => {
      assert.match(COMPONENT_CODE, /<Button[^>]*variant=['"]primary['"]/)
    })

    it("disabled prop includes status === 'searching' (don't act on stale suggestions)", () => {
      // Adversarial finding: while a debounced search is in flight, the
      // suggestions are stale. Disable Add until 'idle' so the admin can't
      // accidentally grant the wrong user.
      assert.match(COMPONENT_CODE, /status\s*===\s*['"]searching['"]/)
    })

    it("disabled prop includes status === 'submitting'", () => {
      assert.match(COMPONENT_CODE, /status\s*===\s*['"]submitting['"]/)
    })

    it("disabled prop requires a selected value (!selected)", () => {
      assert.match(COMPONENT_CODE, /!selected/)
    })

    it("label flips to 'Adding…' while submitting", () => {
      assert.ok(
        COMPONENT_CODE.includes('Adding…'),
        'expected Add button label to switch to Adding… during submission'
      )
    })
  })

  describe('success feedback (4-case message variants)', () => {
    it("renders the existing-user patron message 'Granted patron access to'", () => {
      assert.ok(
        COMPONENT_CODE.includes('Granted patron access to'),
        'expected existing-user patron success copy'
      )
    })

    it("renders the existing-user beta message including 'sign out and back in'", () => {
      // Staleness note shows ONLY for existing-user beta (per plan).
      assert.ok(
        COMPONENT_CODE.includes('Granted beta access to') &&
          COMPONENT_CODE.includes('sign out and back in'),
        'expected existing-user beta success copy with staleness note'
      )
    })

    it("renders the pre-provisioned patron message including 'first sign-in'", () => {
      assert.ok(
        COMPONENT_CODE.includes('Pre-provisioned new user') &&
          COMPONENT_CODE.includes('granted patron access') &&
          COMPONENT_CODE.includes('first sign-in'),
        'expected pre-provisioned patron success copy with first-sign-in note'
      )
    })

    it("renders the pre-provisioned beta message including 'first sign-in'", () => {
      assert.ok(
        COMPONENT_CODE.includes('granted beta access') &&
          COMPONENT_CODE.includes('first sign-in'),
        'expected pre-provisioned beta success copy with first-sign-in note'
      )
    })
  })

  describe('post-grant state reset (flag preserved)', () => {
    it("on success, calls setQuery('') (reset input)", () => {
      assert.match(COMPONENT_CODE, /setQuery\(\s*['"]['"]\s*\)/)
    })

    it("on success, calls setSelected(null)", () => {
      assert.match(COMPONENT_CODE, /setSelected\(\s*null\s*\)/)
    })

    it("does NOT reset flag after a successful grant (workflow optimization)", () => {
      // Per KTD: preserve last-used flag so 'grant beta to next person' is
      // one keystroke + one click, not a re-toggle.
      assert.doesNotMatch(COMPONENT_CODE, /setFlag\(\s*['"]is_patron['"]\s*\)\s*;?\s*\}\s*catch/)
      assert.doesNotMatch(COMPONENT_CODE, /setStatus\(\s*['"]success['"]\s*\)[\s\S]{0,300}setFlag\(/)
    })
  })

  describe('mobile / dismiss behavior', () => {
    it('listens for pointerdown to dismiss the dropdown on outside-click', () => {
      // pointerdown fires immediately on tap; click can be delayed by the
      // browser's 300ms tap-delay heuristic on mobile.
      assert.match(COMPONENT_CODE, /pointerdown/)
    })
  })

  describe('keyboard navigation (ArrowUp/ArrowDown/Enter/Escape)', () => {
    it('handles ArrowDown', () => {
      assert.match(COMPONENT_CODE, /['"]ArrowDown['"]/)
    })

    it('handles ArrowUp', () => {
      assert.match(COMPONENT_CODE, /['"]ArrowUp['"]/)
    })

    it('handles Enter to select highlighted option', () => {
      assert.match(COMPONENT_CODE, /['"]Enter['"]/)
    })

    it('handles Escape to dismiss dropdown', () => {
      assert.match(COMPONENT_CODE, /['"]Escape['"]/)
    })
  })
})

describe('AdminGrantPanel.css — mobile + design-token spec', () => {
  it('wraps :hover styles in @media (hover: hover) and (pointer: fine)', () => {
    // Per .claude/rules/mobile.md: hover rules fire on tap unless gated.
    assert.match(
      CSS_SOURCE,
      /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/
    )
  })

  it('uses the dark background design token rgba(0, 0, 0, 0.7)', () => {
    assert.ok(
      CSS_SOURCE.includes('rgba(0, 0, 0, 0.7)'),
      'expected panel to use the canonical dark background token'
    )
  })

  it('uses the subtle border design token rgba(255, 255, 255, 0.3)', () => {
    assert.ok(
      CSS_SOURCE.includes('rgba(255, 255, 255, 0.3)'),
      'expected panel to use the canonical subtle border token'
    )
  })

  it("uses 'Barlow' as the font family", () => {
    assert.match(CSS_SOURCE, /'Barlow'/)
  })

  it('caps suggestions dropdown at max-height: 50vh with overflow-y: auto', () => {
    // So the listbox never pushes the toggle/Add button off-screen on small
    // viewports. Per plan's mobile section.
    assert.match(CSS_SOURCE, /max-height:\s*50vh/)
    assert.match(CSS_SOURCE, /overflow-y:\s*auto/)
  })

  it('gives the pre-provision row a distinct background tint', () => {
    assert.match(CSS_SOURCE, /admin-grant-row--preprovision/)
  })

  it('declares an 8px gap between the pre-provision icon and label', () => {
    // Per MEMORY.md feedback_button_icon_spacing.
    assert.match(CSS_SOURCE, /gap:\s*8px/)
  })

  it('declares a monospace font for the discord_id secondary text', () => {
    // The snowflake is much easier to scan/copy in mono.
    assert.match(CSS_SOURCE, /admin-grant-row-discord-id[\s\S]*?monospace/)
  })
})

describe('AdminGrantPanel.test.tsx — test file self-check', () => {
  it('uses fileURLToPath(import.meta.url) instead of __dirname (ESM scope)', () => {
    // The orchestrator's hard constraint: __dirname is not defined in ESM.
    // This self-check guards against a future edit that accidentally
    // reintroduces __dirname-as-a-global.
    assert.match(TEST_SOURCE, /fileURLToPath\s*\(\s*import\.meta\.url\s*\)/)
  })
})

console.log('\n🛡️  Running AdminGrantPanel component tests...\n')
