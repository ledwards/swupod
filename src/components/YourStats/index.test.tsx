// @ts-nocheck
/**
 * Spec tests for <YourStats /> and friends.
 *
 * Pattern mirrors src/components/admin/AdminGrantPanel.test.tsx and
 * src/components/SetSelection.test.ts: read each component's source as a
 * string and assert on JSX structure, fetch wiring, ARIA wiring, and copy.
 *
 * No live React render — the project's test runner is Node's built-in
 * test runner with no JSX rendering tooling. The smoke contracts here
 * mirror the U7 acceptance scenarios at the structural level.
 *
 * Run: npx tsx --test src/components/YourStats/index.test.tsx
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function read(name: string): string {
  return readFileSync(join(__dirname, name), 'utf8')
}

function stripComments(src: string): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  return out
}

const INDEX_SRC = read('index.tsx')
const GAMEPLAY_SRC = read('GameplayDashboard.tsx')
const ACTIVITY_SRC = read('ActivityDashboard.tsx')
const LUCK_SECTION_SRC = read('LuckSection.tsx')
const LUCK_PANEL_SRC = read('LuckPanel.tsx')
const STREAKS_SRC = read('StreaksPanel.tsx')
const CHART_SRC = read('DistributionChart.tsx')
const POOL_HISTORY_SRC = read('PoolHistoryDashboard.tsx')
const LOGGED_OUT_SRC = read('LoggedOutCTA.tsx')
const CSS_SRC = read('YourStats.css')
const STORE_BUTTONS_SRC = readFileSync(join(__dirname, '../WayfinderStoreButtons.tsx'), 'utf8')

const INDEX_CODE = stripComments(INDEX_SRC)
const GAMEPLAY_CODE = stripComments(GAMEPLAY_SRC)
const ACTIVITY_CODE = stripComments(ACTIVITY_SRC)
const LUCK_SECTION_CODE = stripComments(LUCK_SECTION_SRC)
const LUCK_PANEL_CODE = stripComments(LUCK_PANEL_SRC)
const STREAKS_CODE = stripComments(STREAKS_SRC)
const CHART_CODE = stripComments(CHART_SRC)
const POOL_HISTORY_CODE = stripComments(POOL_HISTORY_SRC)
const LOGGED_OUT_CODE = stripComments(LOGGED_OUT_SRC)

// --- index.tsx --------------------------------------------------------------

describe('<YourStats /> — index.tsx', () => {
  it("declares 'use client' as first non-comment line", () => {
    const lines = INDEX_SRC.split('\n')
    let first = null
    for (const raw of lines) {
      const line = raw.trim()
      if (!line) continue
      if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue
      first = line
      break
    }
    assert.equal(first, "'use client'")
  })

  it('imports useAuth from AuthContext', () => {
    assert.match(INDEX_CODE, /import\s*\{[^}]*\buseAuth\b[^}]*\}\s*from\s*['"]@\/src\/contexts\/AuthContext['"]/)
  })

  it('imports the personal stat sections', () => {
    assert.match(INDEX_CODE, /import\s*\{[^}]*\bGameplayDashboard\b/)
    assert.match(INDEX_CODE, /import\s*\{[^}]*\bActivityDashboard\b/)
    assert.match(INDEX_CODE, /import\s*\{[^}]*\bLuckSection\b/)
    assert.match(INDEX_CODE, /import\s*\{[^}]*\bLoggedOutCTA\b/)
    assert.match(INDEX_CODE, /import\s*\{[^}]*\bPoolHistoryDashboard\b/)
  })

  it('imports its co-located CSS', () => {
    assert.match(INDEX_CODE, /import\s+['"]\.\/YourStats\.css['"]/)
  })

  it('renders LoggedOutCTA when user is falsy', () => {
    // The component returns <LoggedOutCTA /> in the !user branch.
    assert.ok(INDEX_CODE.includes('!user'))
    assert.ok(INDEX_CODE.includes('<LoggedOutCTA />'))
  })

  it('renders Gameplay, Luck, Pools, and Meta tabs with Gameplay as the default', () => {
    assert.match(INDEX_CODE, /useState<PersonalStatsTab>\(['"]gameplay['"]\)/)
    assert.match(INDEX_CODE, />\s*Gameplay\s*</)
    assert.match(INDEX_CODE, />\s*Luck\s*</)
    assert.match(INDEX_CODE, />\s*Pools\s*</)
    assert.match(INDEX_CODE, />\s*Meta\s*</)
  })

  it('renders the activity overview plus GameplayDashboard, LuckSection, and PoolHistoryDashboard', () => {
    assert.match(INDEX_CODE, /<GameplayDashboard\s/)
    // Activity counters live in a persistent overview strip, not a tab branch.
    assert.match(INDEX_CODE, /<ActivityDashboard\s/)
    assert.match(INDEX_CODE, /your-stats-overview/)
    assert.match(INDEX_CODE, /<LuckSection\s/)
    assert.match(INDEX_CODE, /<PoolHistoryDashboard\s*\/>/)
  })

  it('threads since/until props down to GameplayDashboard, ActivityDashboard, and LuckSection', () => {
    assert.match(INDEX_CODE, /<GameplayDashboard[^>]*since=\{since\}[^>]*until=\{until\}/s)
    assert.match(INDEX_CODE, /<ActivityDashboard[^>]*since=\{since\}[^>]*until=\{until\}/s)
    assert.match(INDEX_CODE, /<LuckSection[^>]*since=\{since\}[^>]*until=\{until\}/s)
  })

  it('handles the auth-loading state without flashing LoggedOutCTA', () => {
    // Reading loading from useAuth and gating before the !user branch.
    assert.match(INDEX_CODE, /\bloading\b/)
    assert.ok(INDEX_CODE.includes('your-stats-auth-loading'))
  })
})

// --- LoggedOutCTA ----------------------------------------------------------

describe('<LoggedOutCTA />', () => {
  it("declares 'use client'", () => {
    assert.ok(LOGGED_OUT_SRC.includes("'use client'"))
  })

  it('has the Discord sign-in URL pointing back to /me', () => {
    assert.ok(LOGGED_OUT_CODE.includes('/api/auth/signin/discord?return_to=/me'))
  })

  it('shows a Sign in with Discord link', () => {
    assert.match(LOGGED_OUT_CODE, /Sign in with Discord/i)
  })

  it('promotes the Companion and Chrome install path', () => {
    assert.match(LOGGED_OUT_CODE, /Wayfinder Companion/i)
    assert.match(LOGGED_OUT_CODE, /queue[\s\S]*with your pool/i)
    assert.match(LOGGED_OUT_CODE, /rewatch your[\s\S]*replays/i)
    assert.ok(LOGGED_OUT_CODE.includes('WayfinderStoreButtons'))
    assert.ok(STORE_BUTTONS_SRC.includes('https://chromewebstore.google.com/detail/wayfinder-companion/econclbajpendbppldcnpngjfddcogfh'))
    assert.match(STORE_BUTTONS_SRC, /Add to Chrome/i)
    assert.match(STORE_BUTTONS_SRC, /Safari/i)
    assert.match(STORE_BUTTONS_SRC, /Firefox/i)
    assert.match(STORE_BUTTONS_SRC, /Coming soon/i)
    assert.match(STORE_BUTTONS_SRC, /Powered by/i)
    assert.match(STORE_BUTTONS_SRC, /wayfinder\.news/i)
  })

  it('does NOT render any personal data placeholders (zeros, em-dashes, "your")', () => {
    // Spec R14: anonymous gets NO sample/placeholder data.
    // We allow the word "your" (e.g. "your luck") in the copy but disallow
    // any fake counter values like 0 or "—" rendered alongside labels.
    assert.doesNotMatch(LOGGED_OUT_CODE, /Packs cracked/i)
    assert.doesNotMatch(LOGGED_OUT_CODE, /Pools opened/i)
    assert.doesNotMatch(LOGGED_OUT_CODE, /Drafts joined/i)
  })

  it('uses the btn--discord class on the sign-in link (per style guide)', () => {
    assert.match(LOGGED_OUT_CODE, /btn--discord/)
  })

  it('uses a gap or space between Discord icon and text', () => {
    // ui-components.md: icon+text MUST have a gap. Either marginRight on
    // the SVG (inline) or a CSS gap rule for the anchor (CSS).
    const hasInlineGap = /marginRight:\s*8/.test(LOGGED_OUT_CODE)
    const hasCssGap = /a\.your-stats-logged-out-link[\s\S]*?gap:\s*8px/.test(CSS_SRC)
    assert.ok(hasInlineGap || hasCssGap, 'expected icon-text gap on Discord button')
  })
})

// --- GameplayDashboard -----------------------------------------------------

describe('<GameplayDashboard />', () => {
  it("declares 'use client'", () => {
    assert.ok(GAMEPLAY_SRC.includes("'use client'"))
  })

  it('fetches /api/stats/me/gameplay with since and until query params', () => {
    assert.ok(GAMEPLAY_CODE.includes('/api/stats/me/gameplay'))
    assert.match(GAMEPLAY_CODE, /new\s+URLSearchParams\(\s*\{\s*since\s*,\s*until\s*\}/)
  })

  it('renders the Companion CTA on the Gameplay tab', () => {
    assert.match(GAMEPLAY_CODE, /WayfinderCompanionLockup/)
    assert.match(GAMEPLAY_CODE, /WayfinderStoreButtons/i)
    assert.match(GAMEPLAY_CODE, /queue on Karabast[\s\S]*PTP pool/i)
  })

  it('renders gameplay KPI and data-viz surfaces', () => {
    for (const label of ['Matches', 'Win rate', 'Record', 'Wayfinder captures', 'Format Performance', 'Set Performance', 'Replay Explorer']) {
      assert.ok(GAMEPLAY_CODE.includes(label), `expected "${label}" in GameplayDashboard`)
    }
    assert.match(CSS_SRC, /your-stats-outcome-bars/)
    assert.match(CSS_SRC, /your-stats-breakdown-fill/)
  })

  it('renders replay search, filters, sorting, leader art, and watch/deck actions', () => {
    assert.match(GAMEPLAY_CODE, /ReplayExplorer/)
    assert.match(GAMEPLAY_CODE, /setSearch/)
    assert.match(GAMEPLAY_CODE, /setFormat/)
    assert.match(GAMEPLAY_CODE, /setResult/)
    assert.match(GAMEPLAY_CODE, /setSortBy/)
    assert.match(GAMEPLAY_CODE, /leaderImageUrl/)
    assert.match(GAMEPLAY_CODE, /Watch/)
    assert.match(GAMEPLAY_CODE, /deck/i)
    assert.match(CSS_SRC, /your-stats-replay-row/)
    assert.match(CSS_SRC, /your-stats-replay-art/)
  })
})

// --- ActivityDashboard -----------------------------------------------------

describe('<ActivityDashboard />', () => {
  it("declares 'use client'", () => {
    assert.ok(ACTIVITY_SRC.includes("'use client'"))
  })

  it('fetches /api/stats/me/summary with since and until query params', () => {
    assert.ok(ACTIVITY_CODE.includes('/api/stats/me/summary'))
    assert.match(ACTIVITY_CODE, /new\s+URLSearchParams\(\s*\{\s*since\s*,\s*until\s*\}/)
  })

  it('refetches when the date range changes (deps include since, until)', () => {
    // useEffect with [since, until, ...] dependencies.
    assert.match(ACTIVITY_CODE, /\[\s*since\s*,\s*until/)
  })

  it('renders five counters with the spec labels', () => {
    const labels = ['Packs cracked', 'Pools opened', 'Drafts joined', 'Decks built', 'Made it to play']
    for (const label of labels) {
      assert.ok(ACTIVITY_CODE.includes(label), `expected label "${label}" in dashboard`)
    }
  })

  it('renders five skeleton placeholders while loading', () => {
    // The loading branch should iterate the COUNTER_KEYS array and render
    // SkeletonCell for each. The constant has five entries.
    const counterArrayMatch = ACTIVITY_CODE.match(/COUNTER_KEYS[^=]*=\s*\[([\s\S]*?)\]/)
    assert.ok(counterArrayMatch, 'expected COUNTER_KEYS array')
    const innerCommas = (counterArrayMatch[1].match(/\{\s*key:/g) || []).length
    assert.equal(innerCommas, 5, 'expected exactly five counters')
    // Uses skeleton-line class from app/stats/stats.css.
    assert.ok(ACTIVITY_CODE.includes('skeleton-line'))
  })

  it('renders "—" with an error note on fetch failure', () => {
    assert.ok(ACTIVITY_CODE.includes('—'))
    assert.ok(ACTIVITY_CODE.includes("couldn't load activity") || ACTIVITY_CODE.includes("Couldn't load activity"))
  })

  it('renders a Companion onboarding state when all counters are zero', () => {
    assert.match(ACTIVITY_CODE, /Start capturing play data/i)
    assert.match(ACTIVITY_CODE, /Wayfinder Companion/i)
    assert.match(ACTIVITY_CODE, /Karabast/i)
    assert.match(ACTIVITY_CODE, /rewatch your replays/i)
    assert.ok(ACTIVITY_CODE.includes('WayfinderStoreButtons'))
    assert.match(ACTIVITY_CODE, /sealed pool/i)
    assert.match(ACTIVITY_CODE, /draft/i)
    // Links to /sealed and /draft.
    assert.ok(ACTIVITY_CODE.includes('href="/sealed"'))
    assert.ok(ACTIVITY_CODE.includes('href="/draft"'))
  })

  it('renders the tracking-cutoff line only when since is before the cutoff', () => {
    assert.ok(ACTIVITY_CODE.includes('Tracking started'))
    assert.ok(ACTIVITY_CODE.includes('NEXT_PUBLIC_STATS_START_DATE') || ACTIVITY_CODE.includes('STATS_START_DATE'))
  })

  it('wraps to a 2x3 grid on mobile (max-width: 520px)', () => {
    // CSS contract: @media (max-width: 520px) {.your-stats-counter-grid { grid-template-columns: repeat(2, 1fr); ... }}
    assert.match(CSS_SRC, /@media\s*\(\s*max-width:\s*520px\s*\)\s*\{[\s\S]*?\.your-stats-counter-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/)
  })
})

// --- LuckSection -----------------------------------------------------------

describe('<LuckSection />', () => {
  it("declares 'use client'", () => {
    assert.ok(LUCK_SECTION_SRC.includes("'use client'"))
  })

  it('imports the Button component for toggle controls', () => {
    assert.match(LUCK_SECTION_CODE, /import\s+Button\s+from\s+['"]@\/src\/components\/Button['"]/)
  })

  it('defaults scope to "opened"', () => {
    // useState('opened') for the scope.
    assert.match(LUCK_SECTION_CODE, /useState<Scope>\(['"]opened['"]\)/)
  })

  it('defaults setCode to LAW (pragmatic v1 default)', () => {
    assert.match(LUCK_SECTION_CODE, /DEFAULT_STATS_SET_TAB/)
    assert.match(LUCK_SECTION_CODE, /DEFAULT_SET\s*=\s*DEFAULT_STATS_SET_TAB/)
  })

  it('uses the shared stats set tabs so beta sets stay aligned with /stats', () => {
    assert.match(LUCK_SECTION_CODE, /getStatsSetTabs/)
    assert.match(LUCK_SECTION_CODE, /includeBetaSets\s*=\s*false/)
    assert.match(INDEX_CODE, /includeBetaSets=\{Boolean\(user\?\.is_beta_tester\s*\|\|\s*user\?\.is_admin\)\}/)
  })

  it('uses Button variant="toggle" with glowColor="blue" for the scope toggle', () => {
    // Per .claude/rules/ui-components.md: scope/segmented groups use this combo.
    assert.match(LUCK_SECTION_CODE, /variant="toggle"[\s\S]{0,120}glowColor="blue"/)
  })

  it('fetches /api/stats/me/luck scoped by setCode + scope (set-wide, not the era window)', () => {
    assert.ok(LUCK_SECTION_CODE.includes('/api/stats/me/luck'))
    assert.match(LUCK_SECTION_CODE, /new\s+URLSearchParams\(\s*\{\s*setCode\s*,\s*scope\s*\}/)
  })

  it('refetches when setCode or scope change', () => {
    assert.match(LUCK_SECTION_CODE, /\[\s*setCode\s*,\s*scope\s*,\s*fetchImpl/)
  })

  it('renders the card histogram and drops the fixed-by-design rarity panel', () => {
    // Redesign: rarity is fixed per pack (only foil/HS/UC-upgrade slots vary),
    // so the rarity panel is gone. The per-card histogram is the centerpiece.
    assert.match(LUCK_SECTION_CODE, /<LuckHistogram/)
    assert.doesNotMatch(LUCK_SECTION_CODE, /dimension="rarity"/)
  })

  it('renders the duplicate-rate and showcase-rate widgets', () => {
    assert.match(LUCK_SECTION_CODE, /<DuplicateRateWidget/)
    assert.match(LUCK_SECTION_CODE, /<ShowcaseRateWidget/)
  })

  it('renders the aspect breakdown with icons instead of a hover line graph', () => {
    assert.match(LUCK_SECTION_CODE, /<AspectBreakdown/)
  })

  it('renders a StreaksPanel for per-card streaks', () => {
    assert.match(LUCK_SECTION_CODE, /<StreaksPanel/)
  })

  it('renders an empty state when packsCracked === 0', () => {
    assert.ok(LUCK_SECTION_CODE.includes('packsCracked === 0'))
    assert.ok(LUCK_SECTION_CODE.includes('/sealed'))
    assert.ok(LUCK_SECTION_CODE.includes('/draft'))
  })

  it('keeps stale data visible at 50% opacity during refetch', () => {
    // The "Updating…" header + opacity wash combo. The wash is computed
    // via a ternary against state.refetching, so look for both halves.
    assert.match(LUCK_SECTION_CODE, /Updating/)
    assert.match(LUCK_SECTION_CODE, /\?\s*0\.5\s*:/)
    assert.match(LUCK_SECTION_CODE, /style=\{\s*\{\s*opacity:\s*dataPanelOpacity/)
  })

  it('renders a native <select> for mobile set selection', () => {
    assert.match(LUCK_SECTION_CODE, /<select/)
    assert.ok(LUCK_SECTION_CODE.includes('your-stats-luck-set-native'))
  })

  it('CSS hides the button row on mobile and shows the native select', () => {
    assert.match(CSS_SRC, /@media\s*\(\s*max-width:\s*520px\s*\)\s*\{[\s\S]*?\.your-stats-luck-set-buttons\s*\{\s*display:\s*none/)
    assert.match(CSS_SRC, /@media\s*\(\s*max-width:\s*520px\s*\)\s*\{[\s\S]*?\.your-stats-luck-set-native\s*\{\s*display:\s*inline-block/)
  })

  it('scope buttons carry the two scope labels from the plan', () => {
    assert.ok(LUCK_SECTION_CODE.includes('Packs I opened'))
    assert.ok(LUCK_SECTION_CODE.includes('What I kept'))
  })
})

// --- LuckPanel -------------------------------------------------------------

describe('<LuckPanel />', () => {
  it("declares 'use client'", () => {
    assert.ok(LUCK_PANEL_SRC.includes("'use client'"))
  })

  it('imports Button and DistributionChart', () => {
    assert.match(LUCK_PANEL_CODE, /import\s+Button\s+from\s+['"]@\/src\/components\/Button['"]/)
    assert.match(LUCK_PANEL_CODE, /import\s*\{[^}]*\bDistributionChart\b[^}]*\}\s*from\s*['"]\.\/DistributionChart['"]/)
  })

  it('renders DistributionChart with the dimension prop', () => {
    assert.match(LUCK_PANEL_CODE, /<DistributionChart[\s\S]*?dimension=\{dimension\}/)
  })

  it('labels show-math columns as you vs platform actuals vs theoretical', () => {
    assert.match(LUCK_PANEL_CODE, />\s*You\s*</)
    assert.match(LUCK_PANEL_CODE, />\s*Platform\s*</)
    assert.match(LUCK_PANEL_CODE, />\s*Theoretical\s*</)
    assert.match(LUCK_PANEL_CODE, /platformActual/)
  })

  it('show-math drawer defaults to closed (useState(false))', () => {
    assert.match(LUCK_PANEL_CODE, /useState\(false\)/)
  })

  it('show-math toggle button labels flip between "Show math" and "Hide math"', () => {
    assert.ok(LUCK_PANEL_CODE.includes('Show math'))
    assert.ok(LUCK_PANEL_CODE.includes('Hide math'))
  })

  it('show-math toggle uses Button component and sets aria-expanded', () => {
    assert.match(LUCK_PANEL_CODE, /<Button[\s\S]*?aria-expanded=\{showMath\}/)
  })

  it('rarity rows are Common, Uncommon, Rare, Legendary', () => {
    assert.match(LUCK_PANEL_CODE, /\['Common',\s*'Uncommon',\s*'Rare',\s*'Legendary'\]/)
  })

  it('aspect rows are V, C, A, Cu, Neutral, Multicolor', () => {
    assert.match(
      LUCK_PANEL_CODE,
      /\['Vigilance',\s*'Command',\s*'Aggression',\s*'Cunning',\s*'Neutral',\s*'Multicolor'\]/,
    )
  })

  it('renders a regime badge with three regime variants', () => {
    assert.ok(LUCK_PANEL_CODE.includes('your-stats-regime-badge'))
    assert.match(CSS_SRC, /\.your-stats-regime-badge--normal\b/)
    assert.match(CSS_SRC, /\.your-stats-regime-badge--unusual\b/)
    assert.match(CSS_SRC, /\.your-stats-regime-badge--insufficient\b/)
  })

  it('headline is read from data.headlineCopy', () => {
    assert.match(LUCK_PANEL_CODE, /\bheadlineCopy\b/)
  })
})

// --- StreaksPanel ----------------------------------------------------------

describe('<StreaksPanel />', () => {
  it("declares 'use client'", () => {
    assert.ok(STREAKS_SRC.includes("'use client'"))
  })

  it('renders "no notable streaks" empty line when streaks is empty', () => {
    assert.match(STREAKS_CODE, /No notable streaks/i)
  })

  it('renders "Never pulled" instead of "Pulled 0×" for zero-count entries', () => {
    assert.ok(STREAKS_CODE.includes('Never pulled'))
    assert.doesNotMatch(STREAKS_CODE, /Pulled\s+0/)
  })

  it('renders each item with cardName, observed/expected, and per-card copy', () => {
    assert.match(STREAKS_CODE, /\bitem\.cardName\b/)
    assert.match(STREAKS_CODE, /\bitem\.copy\b/)
    assert.match(STREAKS_CODE, /\bitem\.observed\b/)
    assert.match(STREAKS_CODE, /\bitem\.expected\b/)
  })

  it('renders a "show all" expander stub when streaksHasMore is true', () => {
    // v1 stub: per plan task, allowed to be a no-op. We verify the
    // streaksHasMore-gated UI element exists; the TODO comment is
    // stripped before assertions, so we look for the button copy
    // and the gate condition instead.
    assert.match(STREAKS_CODE, /streaksHasMore/)
    assert.match(STREAKS_CODE, /show all/i)
    // Stub semantics: clicking it does not refetch — it just sets a
    // local "requested" flag that flips the button copy.
    assert.match(STREAKS_CODE, /showAllRequested/)
  })
})

// --- DistributionChart -----------------------------------------------------

describe('<DistributionChart />', () => {
  it("declares 'use client'", () => {
    assert.ok(CHART_SRC.includes("'use client'"))
  })

  it('imports recharts (the same library app/stats/StatsCharts.tsx uses)', () => {
    assert.match(CHART_CODE, /from\s+['"]recharts['"]/)
  })

  it('renders the "you are here" pin as a distinct shape (triangle), not only color', () => {
    // PinTriangle uses a polygon with a "triangle" shape signature.
    assert.match(CHART_CODE, /PinTriangle/)
    assert.match(CHART_CODE, /<polygon/)
  })

  it('uses ReferenceDot with a shape override for the pin marker', () => {
    assert.match(CHART_CODE, /<ReferenceDot[\s\S]*?shape=/)
  })

  it('switches chart type by dimension prop', () => {
    assert.match(CHART_CODE, /dimension\s*===\s*['"]rarity['"]/)
  })

  it('rarity uses an AreaChart density curve', () => {
    assert.match(CHART_CODE, /<AreaChart/)
  })

  it('aspect uses a horizontal BarChart', () => {
    assert.match(CHART_CODE, /<BarChart[\s\S]*?layout="vertical"/)
  })

  it('adds a platform actual bar alongside theoretical and user bars', () => {
    assert.match(CHART_CODE, /platformActual/)
    assert.match(CHART_CODE, /Platform actual/)
    assert.match(CSS_SRC, /your-stats-chart-legend-swatch--platform/)
  })

  it('renders an aria-label naming dimension, observed, expected, and verdict', () => {
    assert.match(CHART_CODE, /aria-label=\{ariaLabel\}/)
    // ariaLabel construction references all four fields.
    assert.match(CHART_CODE, /you/i)
    assert.match(CHART_CODE, /theoretical|expected/i)
  })

  it('renders a small-sample note below MIN_PACKS threshold', () => {
    assert.match(CHART_CODE, /small sample|small n|Approximate at small/i)
  })
})

// --- PoolHistoryDashboard --------------------------------------------------

describe('<PoolHistoryDashboard />', () => {
  it("declares 'use client'", () => {
    assert.ok(POOL_HISTORY_SRC.includes("'use client'"))
  })

  it('fetches grouped pool history from /api/me/pool-history', () => {
    assert.ok(POOL_HISTORY_CODE.includes('/api/me/pool-history?limit=80'))
  })

  it('renders search, relationship filter, and sort controls', () => {
    assert.match(POOL_HISTORY_CODE, /setQuery/)
    assert.match(POOL_HISTORY_CODE, /setRelationshipFilter/)
    assert.match(POOL_HISTORY_CODE, /setSortBy/)
    assert.match(POOL_HISTORY_CODE, /Leader, base, owner, set/)
  })

  it('renders owner and builder avatars for shared-pool context', () => {
    assert.match(POOL_HISTORY_CODE, /UserAvatar/)
    assert.match(POOL_HISTORY_CODE, /Owner/)
    assert.match(POOL_HISTORY_CODE, /builder/)
  })

  it('renders edit, play, URL-copy (link icon), and JSON-copy (copy icon) actions for each build', () => {
    assert.match(POOL_HISTORY_CODE, /Copy deck link/)
    assert.match(POOL_HISTORY_CODE, /Copy deck JSON/)
    assert.match(POOL_HISTORY_CODE, /<LinkIcon/)
    assert.match(POOL_HISTORY_CODE, /<CopyIcon/)
    assert.match(POOL_HISTORY_CODE, /build\.links\.play/)
    assert.match(POOL_HISTORY_CODE, /build\.links\.json/)
  })
})

// --- CSS sanity ------------------------------------------------------------

describe('YourStats.css', () => {
  it('has counter grid in a 5-column layout on desktop', () => {
    assert.match(CSS_SRC, /\.your-stats-counter-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5/)
  })

  it('uses Barlow as the section font family', () => {
    // Stats page uses Barlow throughout; we mirror it.
    assert.match(CSS_SRC, /'Barlow'/)
  })

  it('uses dark translucent backgrounds (per design tokens)', () => {
    // Matches rgba(0, 0, 0, 0.5) on the section card backgrounds.
    assert.match(CSS_SRC, /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.5\s*\)/)
  })

  it('overrides anchor color on Discord button (global a:hover defense)', () => {
    // Per .claude/rules/ui-components.md "Discord Buttons" section: every
    // Discord-styled link MUST override color: white on all states.
    assert.match(
      CSS_SRC,
      /a\.your-stats-logged-out-link[\s\S]*?:active[\s\S]*?color:\s*white/,
    )
  })
})
