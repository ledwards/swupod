/**
 * SPEC (plans/COMPETITIVE_SEALED_AND_DRAFT_FLOW_PLAN.md, Phase 2):
 *
 *   "Cue engine — 7 clip slots: greeting, ready-the-draft, start-the-draft,
 *    count-30, count-15, count-5, time-is-up. Default pack assets at
 *    public/sounds/voice-packs/default/<clip>.mp3"
 *
 * Creator packs (Phase 3) live in the database and are served from
 * /api/voice-packs/[id]/asset/[clip].
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_VOICE_PACK_ID,
  VOICE_PACK_CLIPS,
  isDefaultVoicePack,
  voicePackAssetUrl,
  voicePackAssetUrls,
} from './voicePackAssets'

describe('voice pack clip slots', () => {
  it('SPEC: exactly the 7 named clips', () => {
    assert.deepStrictEqual([...VOICE_PACK_CLIPS], [
      'greeting',
      'ready-the-draft',
      'start-the-draft',
      'count-30',
      'count-15',
      'count-5',
      'time-is-up',
    ])
  })

  it('SPEC: every default-pack clip exists on disk under public/', () => {
    const repoRoot = process.cwd()
    for (const clip of VOICE_PACK_CLIPS) {
      const url = voicePackAssetUrl(clip, null)
      const file = path.join(repoRoot, 'public', url)
      assert.ok(existsSync(file), `missing default voice pack asset: ${url}`)
    }
  })
})

describe('voicePackAssetUrl', () => {
  it('SPEC: the default pack is served statically from /sounds/voice-packs/default', () => {
    assert.strictEqual(voicePackAssetUrl('greeting', null), '/sounds/voice-packs/default/greeting.mp3')
    assert.strictEqual(voicePackAssetUrl('count-30', 'default'), '/sounds/voice-packs/default/count-30.mp3')
    assert.strictEqual(voicePackAssetUrl('time-is-up'), '/sounds/voice-packs/default/time-is-up.mp3')
  })

  it('SPEC: a creator pack is served from the voice-packs asset route', () => {
    assert.strictEqual(
      voicePackAssetUrl('ready-the-draft', 'a1b2c3'),
      '/api/voice-packs/a1b2c3/asset/ready-the-draft'
    )
  })

  it('a pack id with URL-unsafe characters is encoded, never interpolated raw', () => {
    assert.strictEqual(
      voicePackAssetUrl('greeting', 'pack/../secret'),
      '/api/voice-packs/pack%2F..%2Fsecret/asset/greeting'
    )
  })

  it('an undefined/blank pack id (broadcast field not populated yet) falls back to default', () => {
    assert.strictEqual(voicePackAssetUrl('start-the-draft', undefined), '/sounds/voice-packs/default/start-the-draft.mp3')
    assert.strictEqual(voicePackAssetUrl('start-the-draft', '   '), '/sounds/voice-packs/default/start-the-draft.mp3')
  })
})

describe('isDefaultVoicePack', () => {
  it('SPEC: null, undefined, blank and "default" all mean the built-in pack', () => {
    assert.strictEqual(DEFAULT_VOICE_PACK_ID, 'default')
    assert.strictEqual(isDefaultVoicePack(null), true)
    assert.strictEqual(isDefaultVoicePack(undefined), true)
    assert.strictEqual(isDefaultVoicePack(''), true)
    assert.strictEqual(isDefaultVoicePack('default'), true)
    assert.strictEqual(isDefaultVoicePack('abc123'), false)
  })
})

describe('voicePackAssetUrls', () => {
  it('returns all 7 clips in play order for preloading', () => {
    const urls = voicePackAssetUrls('xyz')
    assert.strictEqual(urls.length, 7)
    assert.deepStrictEqual(urls.map(u => u.clip), [...VOICE_PACK_CLIPS])
    assert.strictEqual(urls[0].url, '/api/voice-packs/xyz/asset/greeting')
  })
})
