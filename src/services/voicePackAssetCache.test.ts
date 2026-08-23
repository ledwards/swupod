// Spec tests for voice-pack media caching.
//
// SPEC: the creator link is a durable EDIT link, so a replaced clip or logo must
// retire every cached copy of the old one. That means:
//   - no `immutable` (it would forbid the revalidation that notices the change),
//   - the ETag varies with the row's updated_at, not just its byte length, so two
//     takes of identical size are never mistaken for each other,
//   - identical bytes at an identical time keep an identical ETag, so an untouched
//     clip still costs a 304 rather than a re-download.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  VOICE_PACK_ASSET_CACHE_CONTROL,
  VOICE_PACK_ASSET_MAX_AGE_SECONDS,
  voicePackAssetCacheHeaders,
  voicePackAssetETag,
} from './voicePackAssetCache'

const PACK = '11111111-2222-4333-8444-555555555555'
const WRITTEN = new Date('2026-08-22T10:00:00Z')
const REWRITTEN = new Date('2026-08-22T10:05:00Z')

describe('voice pack asset cache control', () => {
  it('SPEC: never immutable — an edited clip has to be able to reach listeners', () => {
    assert.equal(VOICE_PACK_ASSET_CACHE_CONTROL.includes('immutable'), false)
  })

  it('SPEC: still cacheable, and revalidated rather than re-downloaded', () => {
    assert.match(VOICE_PACK_ASSET_CACHE_CONTROL, /^public,/)
    assert.match(VOICE_PACK_ASSET_CACHE_CONTROL, /must-revalidate/)
    assert.match(VOICE_PACK_ASSET_CACHE_CONTROL, /max-age=\d+/)
  })

  it('caches for minutes, not hours — an edit must land mid-draft', () => {
    assert.ok(VOICE_PACK_ASSET_MAX_AGE_SECONDS > 0)
    assert.ok(VOICE_PACK_ASSET_MAX_AGE_SECONDS <= 600)
  })

  it('every response carries the nosniff header (uploader-supplied bytes)', () => {
    const headers = voicePackAssetCacheHeaders('"x"')
    assert.equal(headers['X-Content-Type-Options'], 'nosniff')
    assert.equal(headers['ETag'], '"x"')
    assert.equal(headers['Cache-Control'], VOICE_PACK_ASSET_CACHE_CONTROL)
  })
})

describe('voice pack asset ETag', () => {
  it('SPEC: rewriting a slot changes the ETag even when the size is identical', () => {
    const before = voicePackAssetETag(`${PACK}-count-5`, 40960, WRITTEN)
    const after = voicePackAssetETag(`${PACK}-count-5`, 40960, REWRITTEN)
    assert.notEqual(before, after)
  })

  it('SPEC: an untouched slot keeps its ETag, so revalidation is a cheap 304', () => {
    assert.equal(
      voicePackAssetETag(`${PACK}-count-5`, 40960, WRITTEN),
      voicePackAssetETag(`${PACK}-count-5`, 40960, WRITTEN.toISOString())
    )
  })

  it('different slots of one pack never collide', () => {
    assert.notEqual(
      voicePackAssetETag(`${PACK}-count-5`, 40960, WRITTEN),
      voicePackAssetETag(`${PACK}-count-15`, 40960, WRITTEN)
    )
    assert.notEqual(
      voicePackAssetETag(`${PACK}-logo`, 40960, WRITTEN),
      voicePackAssetETag(`${PACK}-greeting`, 40960, WRITTEN)
    )
  })

  it('is a quoted strong validator', () => {
    const etag = voicePackAssetETag(`${PACK}-logo`, 1234, WRITTEN)
    assert.match(etag, /^"[^"]+"$/)
  })

  it('still varies with byte length when the timestamp is unusable', () => {
    const a = voicePackAssetETag(`${PACK}-logo`, 1234, null)
    const b = voicePackAssetETag(`${PACK}-logo`, 4321, 'not-a-date')
    assert.notEqual(a, b)
    assert.match(a, /^"[^"]+"$/)
  })
})
