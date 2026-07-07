// DESIGN.md ⇄ tokens.css parity test (D1, 2026-07-07 design refresh plan).
//
// DESIGN.md frontmatter is the source; src/styles/tokens.css is its generated
// truth in CSS. This test parses both and asserts:
//   1. every frontmatter color / radius / spacing value exists as a --pt-*
//      token with the exact same value;
//   2. every --pt-* token in tokens.css traces back to a frontmatter key
//      (no invented tokens) — derived `-rgb` triplets excepted;
//   3. every derived `--pt-*-rgb` triplet matches its base hex channels.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DESIGN_MD_PATH = join(__dirname, '../../DESIGN.md')
const TOKENS_CSS_PATH = join(__dirname, 'tokens.css')

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

const markdown = readFileSync(DESIGN_MD_PATH, 'utf8')
const css = readFileSync(TOKENS_CSS_PATH, 'utf8')

const colors = parseFrontmatterSection(markdown, 'colors')
const rounded = parseFrontmatterSection(markdown, 'rounded')
const spacing = parseFrontmatterSection(markdown, 'spacing')
const tokens = parseTokens(css)

const expectedTokens = new Map<string, string>()
for (const [key, value] of Object.entries(colors)) expectedTokens.set(`--pt-${key}`, value)
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
})
