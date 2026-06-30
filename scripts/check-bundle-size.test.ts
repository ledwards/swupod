// Unit tests for the bundle-size guard (U5, foundations hardening).
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { extractChunkRefs, findViolations, type RouteReport } from './check-bundle-size'

const MB = 1024 * 1024

function report(route: string, chunks: Array<[string, number]>): RouteReport {
  return {
    route,
    totalBytes: chunks.reduce((sum, [, bytes]) => sum + bytes, 0),
    chunks: chunks.map(([file, bytes]) => ({ file, bytes })),
  }
}

describe('bundle guard', () => {
  describe('extractChunkRefs', () => {
    it('finds chunk script references in route HTML', () => {
      const html = `
        <script src="/_next/static/chunks/abc123.js" async></script>
        <link rel="preload" href="/_next/static/chunks/def456.js" as="script">
        <script src="/_next/static/css/style.css"></script>
      `
      const refs = extractChunkRefs(html)
      assert.deepStrictEqual(refs.sort(), ['static/chunks/abc123.js', 'static/chunks/def456.js'])
    })

    it('deduplicates repeated references', () => {
      const html = '"/_next/static/chunks/x.js" "/_next/static/chunks/x.js"'
      assert.strictEqual(extractChunkRefs(html).length, 1)
    })
  })

  describe('findViolations', () => {
    it('passes a route under both caps', () => {
      const violations = findViolations([report('/', [['static/chunks/a.js', 1 * MB]])])
      assert.deepStrictEqual(violations, [])
    })

    it('flags a single oversized chunk (the cards.json regression case)', () => {
      const violations = findViolations([report('/', [['static/chunks/cards.js', 5.4 * MB]])])
      assert.ok(violations.some(v => v.kind === 'chunk'))
      assert.ok(violations[0].detail.includes('cardData'), 'message must point at the likely cause')
    })

    it('flags a route whose total first-load exceeds the budget', () => {
      const chunks: Array<[string, number]> = [
        ['static/chunks/a.js', 1.5 * MB],
        ['static/chunks/b.js', 1.6 * MB],
      ]
      const violations = findViolations([report('/draft', chunks)])
      assert.ok(violations.some(v => v.kind === 'route-total' && v.route === '/draft'))
    })

    it('reports the same oversized chunk once even when shared across routes', () => {
      const big: [string, number] = ['static/chunks/shared.js', 4 * MB]
      const violations = findViolations([report('/', [big]), report('/draft', [big])])
      assert.strictEqual(violations.filter(v => v.kind === 'chunk').length, 1)
    })

    it('the /deckbuilder/build exemption is ratcheted, not open-ended', () => {
      const over = findViolations([report('/deckbuilder/build', [['static/chunks/cards.js', 7.75 * MB]])])
      assert.ok(over.some(v => v.kind === 'route-total'), 'exceeding the exemption cap still fails')

      const within = findViolations([report('/deckbuilder/build', [['static/chunks/cards.js', 7.25 * MB]])])
      assert.deepStrictEqual(within, [], 'current known weight passes')
    })
  })
})
