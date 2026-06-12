import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  buildLimitedContext,
  hashAnalyticsId,
  normalizeLimitedFormat,
  normalizeLimitedMode,
  routeTemplateFromPath,
} from './limitedEvents.ts'

describe('limited analytics event helpers', () => {
  describe('format and mode normalization', () => {
    it('accepts only the matchmaking formats we compare', () => {
      assert.strictEqual(normalizeLimitedFormat('draft'), 'draft')
      assert.strictEqual(normalizeLimitedFormat('sealed'), 'sealed')
      assert.strictEqual(normalizeLimitedFormat('sealed_pod'), 'sealed')
      assert.strictEqual(normalizeLimitedFormat('pack_wars'), null)
      assert.strictEqual(normalizeLimitedFormat(null), null)
    })

    it('accepts only solo and group modes', () => {
      assert.strictEqual(normalizeLimitedMode('solo'), 'solo')
      assert.strictEqual(normalizeLimitedMode('group'), 'group')
      assert.strictEqual(normalizeLimitedMode('Solo'), 'solo')
      assert.strictEqual(normalizeLimitedMode('queue'), null)
    })
  })

  describe('route templates', () => {
    it('turns dynamic limited URLs into stable route templates', () => {
      assert.strictEqual(routeTemplateFromPath('/pool/abc123/deck/play'), '/pool/[shareId]/deck/play')
      assert.strictEqual(routeTemplateFromPath('/draft/pod123'), '/draft/[shareId]')
      assert.strictEqual(routeTemplateFromPath('/sealed/sealed123/pod'), '/sealed/[shareId]/pod')
      assert.strictEqual(
        routeTemplateFromPath('https://www.protectthepod.com/pool/raw-share/deck/play?utm=x'),
        '/pool/[shareId]/deck/play'
      )
    })
  })

  describe('identifier hashing', () => {
    it('returns a stable analytics hash without exposing the raw share ID', () => {
      const raw = 'AbC123xy'
      const first = hashAnalyticsId(raw)
      const second = hashAnalyticsId(raw)

      assert.strictEqual(first, second)
      assert.ok(first?.startsWith('h_'))
      assert.notStrictEqual(first, raw)
      assert.strictEqual(first?.includes(raw), false)
    })

    it('returns null for empty inputs', () => {
      assert.strictEqual(hashAnalyticsId(''), null)
      assert.strictEqual(hashAnalyticsId('   '), null)
      assert.strictEqual(hashAnalyticsId(null), null)
      assert.strictEqual(hashAnalyticsId(undefined), null)
    })
  })

  describe('context builder', () => {
    it('builds comparable context from mixed client/server property shapes', () => {
      const context = buildLimitedContext({
        poolType: 'sealed_pod',
        mode: 'group',
        setCode: 'JTL',
        shareId: 'pool-share-id',
        draftShareId: 'pod-share-id',
        currentUrl: '/pool/pool-share-id/deck/play',
      })

      assert.strictEqual(context.format, 'sealed')
      assert.strictEqual(context.mode, 'group')
      assert.strictEqual(context.set_code, 'JTL')
      assert.strictEqual(context.route_template, '/pool/[shareId]/deck/play')
      assert.strictEqual(context.source_route, '/pool/[shareId]/deck/play')
      assert.notStrictEqual(context.pool_id_hash, 'pool-share-id')
      assert.notStrictEqual(context.pod_id_hash, 'pod-share-id')
    })

    it('infers solo mode when no pod relationship exists', () => {
      const context = buildLimitedContext({
        format: 'draft',
        set_code: 'SOR',
        shareId: 'solo-pool',
      })

      assert.strictEqual(context.format, 'draft')
      assert.strictEqual(context.mode, 'solo')
      assert.strictEqual(context.set_code, 'SOR')
    })
  })
})
