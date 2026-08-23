/**
 * Spec for the creator voice-pack draft — the pure half of "don't lose my work".
 *
 * SPEC (docs: none — this file is the spec):
 *
 *  1. KEYS ARE TOKEN-SCOPED. Two creator invites open in the same browser must
 *     never read or overwrite each other's draft, so every key — the text blob
 *     in localStorage and every clip row in IndexedDB — carries the token.
 *  2. PARSING IS TOTAL. Anything can be sitting under our key (an older shape,
 *     a truncated string, another app's data). Parsing returns a usable draft
 *     or null; it never throws.
 *  3. A RESTORED CLIP IS A `File`, exactly like a picked one. The form has one
 *     submit path and must not learn a second shape.
 *  4. THE NOTICE IS EARNED. With nothing restored there is no notice at all —
 *     a creator opening a fresh link must never be told work was recovered.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  VOICE_PACK_DRAFT_DB_NAME,
  VOICE_PACK_DRAFT_DB_VERSION,
  VOICE_PACK_DRAFT_STORE,
  VOICE_PACK_DRAFT_TEXT_KEY_PREFIX,
  EMPTY_VOICE_PACK_DRAFT_TEXT,
  isEmptyVoicePackDraftText,
  parseVoicePackDraftText,
  restoredClipFile,
  restoredDraftNotice,
  serializeVoicePackDraftText,
  storedClipRecord,
  voicePackDraftClipKey,
  voicePackDraftClipKeys,
  voicePackDraftTextKey,
  VOICE_PACK_DRAFT_SLOTS,
  VOICE_PACK_LOGO_SLOT,
} from './voicePackDraft'
import { VOICE_PACK_CLIP_TYPES } from './voicePacks'

const TOKEN_A = 'PXqvs0VyXmaVCTBiP_R6fqOHQJWTWABX'
const TOKEN_B = 'ZZZZZZ0VyXmaVCTBiP_R6fqOHQJWTWABX'

describe('voice pack draft keys', () => {
  it('SPEC: the text key is namespaced and carries the token', () => {
    assert.strictEqual(voicePackDraftTextKey(TOKEN_A), `${VOICE_PACK_DRAFT_TEXT_KEY_PREFIX}${TOKEN_A}`)
    assert.ok(voicePackDraftTextKey(TOKEN_A).startsWith('ptp-'), 'namespaced to this app')
  })

  it('SPEC: two tokens never share a text key', () => {
    assert.notStrictEqual(voicePackDraftTextKey(TOKEN_A), voicePackDraftTextKey(TOKEN_B))
  })

  it('SPEC: a clip key is unique per (token, clip)', () => {
    const keys = new Set<string>()
    for (const token of [TOKEN_A, TOKEN_B]) {
      for (const clip of VOICE_PACK_CLIP_TYPES) keys.add(voicePackDraftClipKey(token, clip))
    }
    assert.strictEqual(keys.size, VOICE_PACK_CLIP_TYPES.length * 2)
  })

  it('SPEC: a clip key contains its token, so drafts cannot cross links', () => {
    const key = voicePackDraftClipKey(TOKEN_A, 'count-30')
    assert.ok(key.includes(TOKEN_A))
    assert.ok(key.includes('count-30'))
    assert.ok(!key.includes(TOKEN_B))
  })

  it('SPEC: clearing a draft covers every clip slot AND the logo, all for that token', () => {
    const keys = voicePackDraftClipKeys(TOKEN_A)
    // The logo is stored like a clip, so clearing must reach it too — otherwise
    // a published pack leaves the old logo behind on the device.
    assert.strictEqual(keys.length, VOICE_PACK_CLIP_TYPES.length + 1)
    assert.deepStrictEqual(
      keys,
      VOICE_PACK_DRAFT_SLOTS.map((slot) => voicePackDraftClipKey(TOKEN_A, slot))
    )
    assert.ok(keys.includes(voicePackDraftClipKey(TOKEN_A, VOICE_PACK_LOGO_SLOT)))
    for (const key of keys) assert.ok(key.includes(TOKEN_A))
  })

  it('SPEC: the IndexedDB coordinates are fixed constants', () => {
    assert.strictEqual(VOICE_PACK_DRAFT_DB_NAME, 'ptp-voice-pack-drafts')
    assert.strictEqual(VOICE_PACK_DRAFT_STORE, 'clips')
    assert.strictEqual(VOICE_PACK_DRAFT_DB_VERSION, 1)
  })
})

describe('voice pack draft text serialization', () => {
  it('SPEC: a serialized draft round-trips every field', () => {
    const text = { code: 'PODCAST26', displayName: 'The Pod Cast', creatorName: 'Zoe' }
    const parsed = parseVoicePackDraftText(serializeVoicePackDraftText(text, 1700000000000))
    assert.deepStrictEqual(parsed, text)
  })

  it('SPEC: parsing junk returns null instead of throwing', () => {
    assert.strictEqual(parseVoicePackDraftText(null), null)
    assert.strictEqual(parseVoicePackDraftText(''), null)
    assert.strictEqual(parseVoicePackDraftText('not json at all'), null)
    assert.strictEqual(parseVoicePackDraftText('{"code": '), null)
    assert.strictEqual(parseVoicePackDraftText('[1,2,3]'), null)
    assert.strictEqual(parseVoicePackDraftText('"a string"'), null)
    assert.strictEqual(parseVoicePackDraftText('null'), null)
  })

  it('SPEC: missing and non-string fields degrade to empty strings', () => {
    assert.deepStrictEqual(parseVoicePackDraftText('{}'), EMPTY_VOICE_PACK_DRAFT_TEXT)
    assert.deepStrictEqual(parseVoicePackDraftText('{"code":42,"displayName":{"a":1}}'), {
      code: '',
      displayName: '',
      creatorName: '',
    })
  })

  it('SPEC: restored text respects the form field caps (24 / 60 / 60)', () => {
    const parsed = parseVoicePackDraftText(
      JSON.stringify({ code: 'C'.repeat(90), displayName: 'D'.repeat(90), creatorName: 'N'.repeat(90) })
    )
    assert.strictEqual(parsed?.code.length, 24)
    assert.strictEqual(parsed?.displayName.length, 60)
    assert.strictEqual(parsed?.creatorName.length, 60)
  })

  it('SPEC: the stored payload records when it was saved', () => {
    const raw = JSON.parse(serializeVoicePackDraftText(EMPTY_VOICE_PACK_DRAFT_TEXT, 1700000000000))
    assert.strictEqual(raw.savedAt, 1700000000000)
  })

  it('SPEC: an all-blank draft counts as empty (whitespace is not work)', () => {
    assert.strictEqual(isEmptyVoicePackDraftText(EMPTY_VOICE_PACK_DRAFT_TEXT), true)
    assert.strictEqual(isEmptyVoicePackDraftText({ code: '  ', displayName: '', creatorName: '\n' }), true)
    assert.strictEqual(isEmptyVoicePackDraftText({ code: '', displayName: 'My pack', creatorName: '' }), false)
  })
})

describe('voice pack draft clip records', () => {
  const file = new File([new Uint8Array([1, 2, 3, 4])], 'count-30.webm', { type: 'audio/webm' })

  it('SPEC: a stored record carries its own key, token and clip', () => {
    const record = storedClipRecord(TOKEN_A, 'count-30', file, 1700000000000)
    assert.strictEqual(record.key, voicePackDraftClipKey(TOKEN_A, 'count-30'))
    assert.strictEqual(record.token, TOKEN_A)
    assert.strictEqual(record.clip, 'count-30')
    assert.strictEqual(record.name, 'count-30.webm')
    assert.strictEqual(record.type, 'audio/webm')
    assert.strictEqual(record.savedAt, 1700000000000)
  })

  it('SPEC: a restored clip is a File with the original name, type and bytes', async () => {
    const record = storedClipRecord(TOKEN_A, 'count-30', file, 1)
    const restored = restoredClipFile(record)
    assert.ok(restored instanceof File)
    assert.strictEqual(restored.name, 'count-30.webm')
    assert.strictEqual(restored.type, 'audio/webm')
    assert.strictEqual(restored.size, 4)
    assert.deepStrictEqual(new Uint8Array(await restored.arrayBuffer()), new Uint8Array([1, 2, 3, 4]))
  })

  it('SPEC: a record from a different token is refused', () => {
    const record = storedClipRecord(TOKEN_B, 'count-30', file, 1)
    assert.strictEqual(restoredClipFile(record, TOKEN_A), null)
    assert.ok(restoredClipFile(record, TOKEN_B) instanceof File)
  })

  it('SPEC: a malformed record restores nothing instead of throwing', () => {
    assert.strictEqual(restoredClipFile(null), null)
    assert.strictEqual(restoredClipFile(undefined), null)
    assert.strictEqual(restoredClipFile({ key: 'x' } as never), null)
    assert.strictEqual(restoredClipFile({ blob: 'not a blob', clip: 'count-30' } as never), null)
  })

  it('SPEC: a record for an unknown clip slot is refused', () => {
    const record = { ...storedClipRecord(TOKEN_A, 'count-30', file, 1), clip: 'made-up' as never }
    assert.strictEqual(restoredClipFile(record), null)
  })
})

describe('restoredDraftNotice', () => {
  it('SPEC: nothing restored means no notice at all', () => {
    assert.strictEqual(restoredDraftNotice(0, false), null)
  })

  it('SPEC: text only', () => {
    assert.strictEqual(
      restoredDraftNotice(0, true),
      'Picked up where you left off — your pack details were restored from this browser.'
    )
  })

  it('SPEC: recordings only, singular and plural', () => {
    assert.strictEqual(
      restoredDraftNotice(1, false),
      'Picked up where you left off — 1 of 7 recordings was restored from this browser.'
    )
    assert.strictEqual(
      restoredDraftNotice(5, false),
      'Picked up where you left off — 5 of 7 recordings were restored from this browser.'
    )
  })

  it('SPEC: both', () => {
    assert.strictEqual(
      restoredDraftNotice(7, true),
      'Picked up where you left off — your pack details and 7 of 7 recordings were restored from this browser.'
    )
  })
})
