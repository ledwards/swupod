// DESIGN.md ⇄ tokens.css ⇄ themes.json parity test (D1, 2026-07-07 design
// refresh plan; theme roles added with the site-theme redesign).
//
// DESIGN.md frontmatter is the source; src/styles/tokens.css is its generated
// truth in CSS. This test parses both and asserts:
//   1. every non-theme frontmatter color / radius / spacing value exists as a
//      --pt-* token with the exact same value;
//   2. every --pt-* token in tokens.css traces back to a frontmatter key
//      (no invented tokens) — derived `-rgb` triplets excepted;
//   3. every derived `--pt-*-rgb` triplet matches its base hex channels;
//   4. the `theme-*` frontmatter colors are exactly the default theme's roles
//      in themes.json (they reach CSS as --theme-<role>, not --pt-*);
//   5. every theme in themes.json honours the contract DESIGN.md promises:
//      AA contrast on each text pairing and a surface ladder that climbs.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DESIGN_MD_PATH = join(__dirname, '../../DESIGN.md')
const TOKENS_CSS_PATH = join(__dirname, 'tokens.css')
const THEMES_PATH = join(__dirname, '../presentation/purrgil/themes.json')

// ---------------------------------------------------------------------------
// Parsers (no YAML dep — the frontmatter sections are flat key: "value" maps)
// ---------------------------------------------------------------------------

/** Extract a flat `key: "value"` map from a named top-level frontmatter section. */
export function parseFrontmatterSection(markdown: string, section: string): Record<string, string> {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/)
  assert.ok(frontmatter, 'DESIGN.md must have YAML frontmatter')
  const lines = frontmatter![1]!.split('\n')

  const values: Record<string, string> = {}
  let inSection = false
  for (const line of lines) {
    if (/^\S/.test(line)) {
      inSection = line.trim() === `${section}:`
      continue
    }
    if (!inSection) continue
    const match = line.match(/^\s{2}([\w-]+):\s*"([^"]+)"/)
    if (match) values[match[1]!] = match[2]!
  }
  return values
}

/** Extract every `--pt-*` custom property from tokens.css. */
export function parseTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {}
  const re = /(--pt-[\w-]+)\s*:\s*([^;]+);/g
  let match: RegExpExecArray | null
  while ((match = re.exec(css)) !== null) {
    tokens[match[1]!] = match[2]!.trim()
  }
  return tokens
}

function hexToTriplet(hex: string): string {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

function luminance(hex: string): number {
  const [r, g, b] = hexToTriplet(hex).split(', ').map((channel) => {
    const value = Number(channel) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** themeRole('surfaceRaised') → 'theme-surface-raised' (the --theme-* name). */
function themeKey(role: string): string {
  return 'theme-' + role.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())
}

const markdown = readFileSync(DESIGN_MD_PATH, 'utf8')
const css = readFileSync(TOKENS_CSS_PATH, 'utf8')

const colors = parseFrontmatterSection(markdown, 'colors')
const rounded = parseFrontmatterSection(markdown, 'rounded')
const spacing = parseFrontmatterSection(markdown, 'spacing')
const tokens = parseTokens(css)
const themesFile = JSON.parse(readFileSync(THEMES_PATH, 'utf8'))
const themes: Array<{ id: string; colors: Record<string, string> }> = Array.isArray(themesFile) ? themesFile : themesFile.themes

const themeColors = Object.fromEntries(Object.entries(colors).filter(([key]) => key.startsWith('theme-')))
const expectedTokens = new Map<string, string>()
for (const [key, value] of Object.entries(colors)) {
  if (!key.startsWith('theme-')) expectedTokens.set(`--pt-${key}`, value)
}
for (const [key, value] of Object.entries(rounded)) expectedTokens.set(`--pt-radius-${key}`, value)
for (const [key, value] of Object.entries(spacing)) expectedTokens.set(`--pt-space-${key}`, value)

describe('tokens.css ⇄ DESIGN.md parity', () => {
  it('parses a plausible frontmatter (sanity floor)', () => {
    assert.ok(Object.keys(colors).length >= 20, `expected ≥20 colors, got ${Object.keys(colors).length}`)
    assert.ok(Object.keys(rounded).length >= 5, `expected ≥5 radii, got ${Object.keys(rounded).length}`)
    assert.ok(Object.keys(spacing).length === 5, `expected 5 spacings, got ${Object.keys(spacing).length}`)
  })

  it('every DESIGN.md frontmatter value exists as a --pt token with the exact value', () => {
    for (const [token, value] of expectedTokens) {
      assert.ok(token in tokens, `tokens.css is missing ${token} (DESIGN.md value ${value})`)
      assert.equal(
        tokens[token]!.toLowerCase(),
        value.toLowerCase(),
        `${token} diverges from DESIGN.md: tokens.css has ${tokens[token]}, DESIGN.md says ${value}`
      )
    }
  })

  it('every non-derived --pt token traces back to a DESIGN.md frontmatter key', () => {
    for (const token of Object.keys(tokens)) {
      if (token.endsWith('-rgb')) continue
      assert.ok(
        expectedTokens.has(token),
        `${token} exists in tokens.css but has no DESIGN.md frontmatter source — add it to DESIGN.md first`
      )
    }
  })

  it('every derived --pt-*-rgb triplet matches its base hex channels', () => {
    const derived = Object.keys(tokens).filter((token) => token.endsWith('-rgb'))
    assert.ok(derived.length > 0, 'expected derived -rgb triplets')
    for (const token of derived) {
      const base = token.slice(0, -'-rgb'.length)
      assert.ok(base in tokens, `${token} has no base token ${base}`)
      const baseHex = tokens[base]!
      assert.match(baseHex, /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, `${base} must be a hex color`)
      assert.equal(
        tokens[token],
        hexToTriplet(baseHex),
        `${token} does not match the channels of ${base} (${baseHex})`
      )
    }
  })

  it('DESIGN.md theme-* colors are exactly the default theme (purrgil) roles', () => {
    const purrgil = themes.find((theme) => theme.id === 'purrgil')
    assert.ok(purrgil, 'themes.json must contain the default purrgil theme')
    const roles = Object.keys(purrgil!.colors)
    assert.equal(Object.keys(themeColors).length, roles.length, 'DESIGN.md must list every theme role, and only those')
    for (const role of roles) {
      const key = themeKey(role)
      assert.ok(key in themeColors, `DESIGN.md is missing ${key}`)
      assert.equal(themeColors[key]!.toLowerCase(), purrgil!.colors[role]!.toLowerCase(), `${key} diverges from themes.json purrgil`)
    }
  })
})

describe('every site theme honours the DESIGN.md contract', () => {
  // AA body text is 4.5:1; borders and other non-text UI need 3:1.
  const pairs: Array<[string, string, number]> = [
    ['text', 'canvas', 4.5],
    ['text', 'surface', 4.5],
    ['text', 'surfaceRaised', 4.5],
    ['text', 'surfaceHover', 4.5],
    ['textMuted', 'surface', 4.5],
    ['textMuted', 'surfaceRaised', 4.5],
    ['onAccent', 'accent', 4.5],
    ['onAccent', 'accentHover', 4.5],
    ['accent', 'surface', 4.5],
    ['highlight', 'surface', 4.5],
    ['danger', 'surfaceRaised', 4.5],
    ['success', 'surface', 4.5],
    ['warning', 'surface', 4.5],
    ['info', 'surface', 4.5],
    ['border', 'surface', 3],
    ['focus', 'canvas', 3],
  ]

  for (const theme of themes) {
    it(`${theme.id}: text pairings clear AA`, () => {
      for (const [fg, bg, min] of pairs) {
        const ratio = contrast(theme.colors[fg]!, theme.colors[bg]!)
        assert.ok(ratio >= min, `${theme.id}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`)
      }
    })

    it(`${theme.id}: surfaces climb canvas → surface → raised → hover`, () => {
      const ladder = ['canvas', 'surface', 'surfaceRaised', 'surfaceHover'].map((role) => luminance(theme.colors[role]!))
      for (let i = 1; i < ladder.length; i++) {
        assert.ok(ladder[i]! > ladder[i - 1]!, `${theme.id}: surface ladder must get lighter at step ${i}`)
      }
    })
  }
})
