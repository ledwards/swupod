// Spec tests for the creator voice-pack domain rules.
//
// SPEC (plans Phase 3 + user's brief):
//   - Exactly 7 clip slots, ids fixed: greeting, ready-the-draft, start-the-draft,
//     count-30, count-15, count-5, time-is-up. The cue engine, the API URL shape and
//     migration 080's CHECK constraint must all agree on this list.
//   - Redemption codes are stored normalized (whitespace stripped, uppercased) so one
//     code can never become two packs.
//   - An invite opens the creator form only while unused AND unexpired.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  VOICE_PACK_CLIP_TYPES,
  isVoicePackClipType,
  normalizeVoicePackCode,
  isValidVoicePackCode,
  normalizeVoicePackName,
  voicePackAssetUrl,
  voicePackLogoUrl,
  voicePackInvitePath,
  isInviteUsable,
  clampInviteExpiryDays,
  INVITE_EXPIRY_DAYS_DEFAULT,
  INVITE_EXPIRY_DAYS_MIN,
  INVITE_EXPIRY_DAYS_MAX,
} from './voicePacks'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('voice pack clip types', () => {
  it('SPEC: is exactly the 7 cue slots, in cue order', () => {
    assert.deepEqual(VOICE_PACK_CLIP_TYPES as readonly string[], [
      'greeting',
      'ready-the-draft',
      'start-the-draft',
      'count-30',
      'count-15',
      'count-5',
      'time-is-up',
    ])
  })

  it('SPEC: migration 080 constrains clip_type to the same 7 ids', () => {
    const sql = readFileSync(join(REPO_ROOT, 'migrations', '080_create_voice_packs.sql'), 'utf8')
    const check = sql.slice(sql.indexOf('voice_pack_assets_clip_type_check'))
    for (const clip of VOICE_PACK_CLIP_TYPES) {
      assert.ok(check.includes(`'${clip}'`), `migration 080 CHECK is missing '${clip}'`)
    }
    // And nothing extra: count the quoted literals inside the CHECK body.
    const body = check.slice(0, check.indexOf(')\n  ),'))
    const quoted = body.match(/'[a-z0-9-]+'/g) ?? []
    assert.equal(quoted.length, VOICE_PACK_CLIP_TYPES.length)
  })

  it('accepts only the known ids', () => {
    assert.equal(isVoicePackClipType('count-15'), true)
    assert.equal(isVoicePackClipType('count-10'), false)
    assert.equal(isVoicePackClipType('GREETING'), false)
    assert.equal(isVoicePackClipType(''), false)
    assert.equal(isVoicePackClipType(null), false)
    assert.equal(isVoicePackClipType(['greeting']), false)
  })

  it('builds the asset URL shape the cue engine fetches', () => {
    assert.equal(voicePackAssetUrl('abc-123', 'time-is-up'), '/api/voice-packs/abc-123/asset/time-is-up')
    assert.equal(voicePackLogoUrl('abc-123'), '/api/voice-packs/abc-123/logo')
    assert.equal(voicePackInvitePath('tok'), '/creator/voice-pack/tok')
  })
})

describe('redemption code normalization', () => {
  it('SPEC: strips whitespace and uppercases, so spellings collapse to one code', () => {
    assert.equal(normalizeVoicePackCode('  ahsoka-2026 '), 'AHSOKA-2026')
    assert.equal(normalizeVoicePackCode('ahsoka 2026'), 'AHSOKA2026')
    assert.equal(normalizeVoicePackCode('AHSOKA2026'), 'AHSOKA2026')
    assert.equal(normalizeVoicePackCode('\tah\nsoka '), 'AHSOKA')
  })

  it('normalizing is idempotent (a stored code re-normalizes to itself)', () => {
    const once = normalizeVoicePackCode('  pod cast-01 ')
    assert.equal(normalizeVoicePackCode(once), once)
  })

  it('returns empty string for non-strings rather than throwing', () => {
    assert.equal(normalizeVoicePackCode(undefined), '')
    assert.equal(normalizeVoicePackCode(42), '')
    assert.equal(normalizeVoicePackCode({}), '')
  })

  it('SPEC: valid codes are 3-24 chars of A-Z/0-9 with internal hyphens only', () => {
    assert.equal(isValidVoicePackCode('POD'), true)
    assert.equal(isValidVoicePackCode('AHSOKA-2026'), true)
    assert.equal(isValidVoicePackCode('A'.repeat(24)), true)

    assert.equal(isValidVoicePackCode('AB'), false, 'too short')
    assert.equal(isValidVoicePackCode('A'.repeat(25)), false, 'too long')
    assert.equal(isValidVoicePackCode('-POD'), false, 'leading hyphen')
    assert.equal(isValidVoicePackCode('POD-'), false, 'trailing hyphen')
    assert.equal(isValidVoicePackCode('pod123'), false, 'must be pre-normalized')
    assert.equal(isValidVoicePackCode('POD 123'), false, 'no spaces')
    assert.equal(isValidVoicePackCode('POD/../ETC'), false, 'no path characters')
    assert.equal(isValidVoicePackCode(''), false)
  })
})

describe('display names', () => {
  it('collapses whitespace, trims, and caps at 60 chars', () => {
    assert.equal(normalizeVoicePackName('  The   Pod  Cast '), 'The Pod Cast')
    assert.equal(normalizeVoicePackName('x'.repeat(100)).length, 60)
    assert.equal(normalizeVoicePackName(null), '')
  })
})

describe('invite usability', () => {
  const now = new Date('2026-07-31T12:00:00Z')
  const future = new Date('2026-08-30T12:00:00Z')
  const past = new Date('2026-07-01T12:00:00Z')

  it('SPEC: an unused, unexpired invite is usable', () => {
    assert.equal(isInviteUsable({ used_at: null, expires_at: future }, now), true)
  })

  it('SPEC: an invite is single-use — once used_at is set it is dead', () => {
    assert.equal(isInviteUsable({ used_at: past, expires_at: future }, now), false)
  })

  it('SPEC: an expired invite is dead even if never used', () => {
    assert.equal(isInviteUsable({ used_at: null, expires_at: past }, now), false)
  })

  it('treats the expiry instant itself as expired', () => {
    assert.equal(isInviteUsable({ used_at: null, expires_at: now }, now), false)
  })

  it('accepts ISO strings as well as Dates (pg driver returns either)', () => {
    assert.equal(isInviteUsable({ used_at: null, expires_at: future.toISOString() }, now), true)
  })

  it('rejects a missing invite and unparseable expiries', () => {
    assert.equal(isInviteUsable(null, now), false)
    assert.equal(isInviteUsable({ used_at: null, expires_at: null }, now), false)
    assert.equal(isInviteUsable({ used_at: null, expires_at: 'not-a-date' }, now), false)
  })
})

describe('invite expiry clamping', () => {
  it('clamps to the permitted window and defaults on junk', () => {
    assert.equal(clampInviteExpiryDays(30), 30)
    assert.equal(clampInviteExpiryDays(0), INVITE_EXPIRY_DAYS_MIN)
    assert.equal(clampInviteExpiryDays(9999), INVITE_EXPIRY_DAYS_MAX)
    assert.equal(clampInviteExpiryDays(-5), INVITE_EXPIRY_DAYS_MIN)
    assert.equal(clampInviteExpiryDays('abc'), INVITE_EXPIRY_DAYS_DEFAULT)
    assert.equal(clampInviteExpiryDays(undefined), INVITE_EXPIRY_DAYS_DEFAULT)
    assert.equal(clampInviteExpiryDays(7.9), 7)
  })
})
