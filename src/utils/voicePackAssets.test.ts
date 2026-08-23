/**
 * SPEC (plans/COMPETITIVE_SEALED_AND_DRAFT_FLOW_PLAN.md, Phase 2):
 *
 *   "Cue engine — 7 clip slots: greeting, ready-the-draft, start-the-draft,
 *    count-30, count-15, count-5, time-is-up. Built-in packs ship as static
 *    files under public/sounds/voice-packs/<pack>/<clip>.mp3, and every
 *    account has all of them — no redemption needed."
 *
 * The built-in set is now exactly the language packs. Creator packs (Phase 3) live
 * in the database and are served from /api/voice-packs/[id]/asset/[clip] — Leebo
 * among them, seeded by migration 086 as the first pack by Protect the Pod.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  BUILT_IN_VOICE_PACKS,
  DEFAULT_VOICE_PACK_ID,
  VOICE_PACK_CLIPS,
  isBuiltInVoicePack,
  voicePackAssetUrl,
  voicePackAssetUrls,
} from './voicePackAssets'

describe('voice pack clip slots', () => {
  it('SPEC: exactly these named clips, in cue order', () => {
    assert.deepStrictEqual([...VOICE_PACK_CLIPS], [
      'greeting',
      'ready-the-draft',
      'start-the-draft',
      'count-30',
      'count-15',
      'count-5',
      'time-is-up',
      'sound-on',
      'timer-paused',
      'timer-resumed',
      'next-pick',
    ])
  })

  it('SPEC: every clip of every built-in pack exists on disk under public/', () => {
    const repoRoot = process.cwd()
    for (const pack of BUILT_IN_VOICE_PACKS) {
      for (const clip of VOICE_PACK_CLIPS) {
        const url = voicePackAssetUrl(clip, pack.id)
        const file = path.join(repoRoot, 'public', url)
        assert.ok(existsSync(file), `missing ${pack.id} voice pack asset: ${url}`)
      }
    }
  })
})

describe('voicePackAssetUrl', () => {
  it('SPEC: a built-in pack is served statically from its own directory', () => {
    assert.strictEqual(voicePackAssetUrl('greeting', null), '/sounds/voice-packs/english/greeting.mp3')
    assert.strictEqual(voicePackAssetUrl('count-30', 'default'), '/sounds/voice-packs/english/count-30.mp3')
    assert.strictEqual(voicePackAssetUrl('time-is-up'), '/sounds/voice-packs/english/time-is-up.mp3')
    assert.strictEqual(voicePackAssetUrl('greeting', 'french'), '/sounds/voice-packs/french/greeting.mp3')
    assert.strictEqual(voicePackAssetUrl('time-is-up', 'italian'), '/sounds/voice-packs/italian/time-is-up.mp3')
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
    assert.strictEqual(voicePackAssetUrl('start-the-draft', undefined), '/sounds/voice-packs/english/start-the-draft.mp3')
    assert.strictEqual(voicePackAssetUrl('start-the-draft', '   '), '/sounds/voice-packs/english/start-the-draft.mp3')
  })
})

describe('isBuiltInVoicePack', () => {
  it('SPEC: null, undefined, blank and "default" all mean the default pack', () => {
    // The default must be a pack EVERY viewer may use, so it is a language pack.
    assert.strictEqual(DEFAULT_VOICE_PACK_ID, 'english')
    assert.strictEqual(isBuiltInVoicePack(null), true)
    assert.strictEqual(isBuiltInVoicePack(undefined), true)
    assert.strictEqual(isBuiltInVoicePack(''), true)
    assert.strictEqual(isBuiltInVoicePack('default'), true)
  })

  it('SPEC: every shipped pack is built in; a creator pack id is not', () => {
    for (const pack of BUILT_IN_VOICE_PACKS) {
      assert.strictEqual(isBuiltInVoicePack(pack.id), true, `${pack.id} should be built in`)
    }
    assert.strictEqual(isBuiltInVoicePack('abc123'), false)
  })

  it('SPEC: the shipped set is the five language packs, and nothing else', () => {
    assert.deepStrictEqual(BUILT_IN_VOICE_PACKS.map(p => p.id),
      ['english', 'french', 'german', 'spanish', 'italian'])
  })

  it('SPEC: Leebo is NOT built in — he is a creator pack served from the API', () => {
    // He is a voice_packs row (migration 086). Treating him as built in would hand
    // his audio to everyone for free and 404 on the uuid cast in the asset route.
    assert.strictEqual(isBuiltInVoicePack('leebo'), false)
    assert.strictEqual(
      voicePackAssetUrl('greeting', 'leebo'),
      '/api/voice-packs/leebo/asset/greeting'
    )
  })
})

describe('voicePackAssetUrls', () => {
  it('returns every clip in play order for preloading', () => {
    const urls = voicePackAssetUrls('xyz')
    assert.strictEqual(urls.length, VOICE_PACK_CLIPS.length)
    assert.deepStrictEqual(urls.map(u => u.clip), [...VOICE_PACK_CLIPS])
    assert.strictEqual(urls[0].url, '/api/voice-packs/xyz/asset/greeting')
  })
})
