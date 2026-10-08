// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildLeaderArtIndex, resolveLeaderArt } from './hyperspaceLeaderArt'

// Synthetic leader card data — kept independent of cards.json so the SPEC is
// stable as real sets change. Mirrors the shape buildLeaderArtIndex reads.
const leader = (name, subtitle, set, art, opts = {}) => ({
  name,
  subtitle,
  set,
  type: 'Leader',
  isLeader: true,
  backImageUrl: art,
  imageUrl: opts.front ?? null,
  isHyperspace: !!opts.hs,
  variantType: opts.hs ? 'Hyperspace' : 'Normal',
})

describe('leader art resolver', () => {
  describe('Hyperspace preference', () => {
    it('SPEC: prefers the Hyperspace printing when one exists', () => {
      const idx = buildLeaderArtIndex([
        leader('Hero', 'Brave', 'AAA', 'normal.png'),
        leader('Hero', 'Brave', 'AAA', 'hyper.png', { hs: true }),
      ])
      assert.strictEqual(resolveLeaderArt(idx, 'Hero, Brave', 'AAA'), 'hyper.png')
    })

    it('SPEC: prefers Hyperspace regardless of card order', () => {
      const idx = buildLeaderArtIndex([
        leader('Hero', 'Brave', 'AAA', 'hyper.png', { hs: true }),
        leader('Hero', 'Brave', 'AAA', 'normal.png'),
      ])
      assert.strictEqual(resolveLeaderArt(idx, 'Hero, Brave', 'AAA'), 'hyper.png')
    })
  })

  describe('Non-Hyperspace fallback (pre-release sets like ASH)', () => {
    it('SPEC: falls back to normal art when the set has NO Hyperspace leaders', () => {
      // ASH-like: only a normal printing exists, no Hyperspace variant.
      const idx = buildLeaderArtIndex([leader('Cad Bane', 'Still Faster than You', 'ASH', 'cadbane.png')])
      assert.strictEqual(resolveLeaderArt(idx, 'Cad Bane, Still Faster than You', 'ASH'), 'cadbane.png')
    })

    it('SPEC: uses front art if no landscape/back art is present', () => {
      const idx = buildLeaderArtIndex([
        { name: 'Grogu', subtitle: 'Big Hugs', set: 'ASH', type: 'Leader', isLeader: true, backImageUrl: null, imageUrl: 'grogu-front.png' },
      ])
      assert.strictEqual(resolveLeaderArt(idx, 'Grogu, Big Hugs', 'ASH'), 'grogu-front.png')
    })
  })

  describe('Subtitle disambiguation (never strip the subtitle)', () => {
    it('SPEC: the same bare name with different subtitles resolves to different art', () => {
      const idx = buildLeaderArtIndex([
        leader('Darth Vader', 'Unstoppable', 'LAW', 'vader-law.png'),
        leader('Darth Vader', 'Dark Lord of the Sith', 'SOR', 'vader-sor.png'),
      ])
      assert.strictEqual(resolveLeaderArt(idx, 'Darth Vader, Unstoppable', 'LAW'), 'vader-law.png')
      assert.strictEqual(resolveLeaderArt(idx, 'Darth Vader, Dark Lord of the Sith', 'SOR'), 'vader-sor.png')
    })

    it('SPEC: full name wins even when the set hint points elsewhere', () => {
      const idx = buildLeaderArtIndex([
        leader('Darth Vader', 'Unstoppable', 'LAW', 'vader-law.png'),
        leader('Darth Vader', 'Dark Lord of the Sith', 'SOR', 'vader-sor.png'),
      ])
      // Match tagged SOR, opponent actually played the LAW Vader → LAW art.
      assert.strictEqual(resolveLeaderArt(idx, 'Darth Vader, Unstoppable', 'SOR'), 'vader-law.png')
    })
  })

  describe('Set-agnostic opponent resolution (constructed play)', () => {
    it('SPEC: an opponent leader from another set resolves under the match set', () => {
      const idx = buildLeaderArtIndex([
        // Match set is ASH; opponent's leader lives only in JTL.
        leader('Cad Bane', 'Hello There', 'ASH', 'cadbane-ash.png'),
        leader('Poe Dameron', 'I Can Fly Anything', 'JTL', 'poe-jtl.png'),
      ])
      assert.strictEqual(resolveLeaderArt(idx, 'Poe Dameron, I Can Fly Anything', 'ASH'), 'poe-jtl.png')
    })
  })

  describe('Bare-name back-compat (deck / pool-history callers)', () => {
    it('SPEC: a bare card name with the correct set still resolves', () => {
      const idx = buildLeaderArtIndex([leader('Ezra Bridger', "It's Now or Never", 'ASH', 'ezra.png')])
      assert.strictEqual(resolveLeaderArt(idx, 'Ezra Bridger', 'ASH'), 'ezra.png')
    })
  })

  describe('Edge cases', () => {
    it('SPEC: null/empty name returns null', () => {
      const idx = buildLeaderArtIndex([leader('Hero', 'Brave', 'AAA', 'a.png')])
      assert.strictEqual(resolveLeaderArt(idx, null, 'AAA'), null)
      assert.strictEqual(resolveLeaderArt(idx, '', 'AAA'), null)
    })

    it('SPEC: an unknown leader returns null', () => {
      const idx = buildLeaderArtIndex([leader('Hero', 'Brave', 'AAA', 'a.png')])
      assert.strictEqual(resolveLeaderArt(idx, 'Nobody, At All', 'AAA'), null)
    })

    it('SPEC: case and whitespace are normalized', () => {
      const idx = buildLeaderArtIndex([leader('Hero', 'Brave', 'AAA', 'a.png')])
      assert.strictEqual(resolveLeaderArt(idx, '  hero, BRAVE  ', 'aaa'), 'a.png')
    })

    it('SPEC: non-leader cards are ignored', () => {
      const idx = buildLeaderArtIndex([
        { name: 'Some Unit', subtitle: null, set: 'AAA', type: 'Unit', backImageUrl: 'unit.png' },
      ])
      assert.strictEqual(resolveLeaderArt(idx, 'Some Unit', 'AAA'), null)
    })
  })
})
