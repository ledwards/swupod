// Spec tests for the creator voice-pack domain rules.
//
// SPEC (plans Phase 3 + user's brief):
//   - Exactly 7 clip slots, ids fixed: greeting, ready-the-draft, start-the-draft,
//     count-30, count-15, count-5, time-is-up. The cue engine, the API URL shape and
//     migration 080's CHECK constraint must all agree on this list.
//   - Redemption codes are stored normalized (whitespace stripped, uppercased) so one
//     code can never become two packs.
//   - An invite opens the creator form for a NEW pack only while unused AND unexpired.
//   - Once an invite HAS published a pack the same link is that creator's durable
//     edit handle: it resolves forever, populated, and submitting updates in place.
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
  voicePackInviteAccess,
  missingVoicePackClips,
  canUseVoicePack,
  isPatronOnlyBuiltInVoicePack,
  defaultVoicePackIdForViewer,
  PATRON_ONLY_BUILT_IN_VOICE_PACK_IDS,
  FREE_DEFAULT_VOICE_PACK_ID,
  clampInviteExpiryDays,
  INVITE_EXPIRY_DAYS_DEFAULT,
  INVITE_EXPIRY_DAYS_MIN,
  INVITE_EXPIRY_DAYS_MAX,
} from './voicePacks'
import { BUILT_IN_VOICE_PACKS } from '../utils/voicePackAssets'

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

describe('what a creator link can do (create vs edit vs 404)', () => {
  const now = new Date('2026-07-31T12:00:00Z')
  const future = new Date('2026-08-30T12:00:00Z')
  const past = new Date('2026-07-01T12:00:00Z')
  const pack = { id: 'ba5eba11-0000-4000-8000-000000000001' }

  it('SPEC: a fresh, unexpired invite that has published nothing opens an EMPTY form', () => {
    assert.equal(voicePackInviteAccess({ used_at: null, expires_at: future }, null, now), 'create')
  })

  it('SPEC: an invite that already published a pack is an EDIT link, not a 404', () => {
    assert.equal(voicePackInviteAccess({ used_at: past, expires_at: future }, pack, now), 'edit')
  })

  it('SPEC: an EXPIRED link still edits the pack it published — the pack outlives the offer', () => {
    // Expiry bounds how long the offer to CREATE stands. Once a pack is live this
    // URL is the creator's only handle on it; letting it rot would strand them
    // with a published voice they cannot fix while players keep hearing it.
    assert.equal(voicePackInviteAccess({ used_at: past, expires_at: past }, pack, now), 'edit')
  })

  it('SPEC: an expired link that never published anything stays dead', () => {
    assert.equal(voicePackInviteAccess({ used_at: null, expires_at: past }, null, now), 'denied')
  })

  it('SPEC: an unknown token is denied whether or not a pack is passed', () => {
    assert.equal(voicePackInviteAccess(null, null, now), 'denied')
    assert.equal(voicePackInviteAccess(null, pack, now), 'denied')
  })

  it('SPEC: a spent invite whose pack is gone cannot start a second pack', () => {
    // used_at is set but no pack row survives (an admin deleted it). There is
    // nothing to edit and the offer was already taken, so the link is dead.
    assert.equal(voicePackInviteAccess({ used_at: past, expires_at: future }, null, now), 'denied')
  })

  it('a pack row without an id is not a pack', () => {
    assert.equal(voicePackInviteAccess({ used_at: past, expires_at: future }, { id: null }, now), 'denied')
  })

  it('every unexpired unused invite that isInviteUsable accepts is a create link', () => {
    // The two predicates must not drift: creation is still exactly "unused and unexpired".
    for (const invite of [
      { used_at: null, expires_at: future },
      { used_at: null, expires_at: past },
      { used_at: past, expires_at: future },
    ]) {
      const usable = isInviteUsable(invite, now)
      assert.equal(voicePackInviteAccess(invite, null, now) === 'create', usable)
    }
  })
})

describe('which cue slots a submit still has to fill', () => {
  it('SPEC: publishing a NEW pack requires all seven', () => {
    assert.deepEqual(missingVoicePackClips([]), [...VOICE_PACK_CLIP_TYPES])
    assert.deepEqual(missingVoicePackClips(VOICE_PACK_CLIP_TYPES), [])
  })

  it('SPEC: an edit that replaces one line keeps the other six — nothing is missing', () => {
    assert.deepEqual(missingVoicePackClips(['count-5'], VOICE_PACK_CLIP_TYPES), [])
  })

  it('SPEC: a slot is missing only when neither the upload nor the pack has it', () => {
    const published = ['greeting', 'ready-the-draft', 'start-the-draft', 'count-30', 'count-15']
    assert.deepEqual(missingVoicePackClips(['count-5'], published), ['time-is-up'])
  })

  it('returns the missing slots in cue order, never duplicated', () => {
    assert.deepEqual(missingVoicePackClips(['count-5', 'count-5'], ['greeting']), [
      'ready-the-draft',
      'start-the-draft',
      'count-30',
      'count-15',
      'time-is-up',
    ])
  })

  it('ignores ids that are not cue slots', () => {
    assert.deepEqual(missingVoicePackClips(['logo', 'count-10'], VOICE_PACK_CLIP_TYPES.slice(0, 6)), [
      'time-is-up',
    ])
  })
})

describe('who may use which voice pack', () => {
  const LANGUAGE = { isBuiltIn: true, isPatron: false, hasEntitlement: false }
  const CREATOR_PACK = 'ba5eba11-0000-4000-8000-000000000001'

  it('SPEC: the language packs are free to everyone, signed in or not', () => {
    for (const id of ['english', 'french', 'german', 'spanish', 'italian']) {
      assert.equal(canUseVoicePack(id, LANGUAGE), true, `${id} must be free`)
    }
  })

  it('SPEC: Leebo is a Friend of the Pod pack, not a free built-in', () => {
    assert.equal(isPatronOnlyBuiltInVoicePack('leebo'), true)
    assert.equal(canUseVoicePack('leebo', { ...LANGUAGE, isPatron: false }), false)
    assert.equal(canUseVoicePack('leebo', { ...LANGUAGE, isPatron: true }), true)
  })

  it('SPEC: a Friend of the Pod gets every creator pack without redeeming', () => {
    assert.equal(
      canUseVoicePack(CREATOR_PACK, { isBuiltIn: false, isPatron: true, hasEntitlement: false }),
      true
    )
  })

  it('SPEC: everyone else gets a creator pack only by redeeming its code', () => {
    assert.equal(
      canUseVoicePack(CREATOR_PACK, { isBuiltIn: false, isPatron: false, hasEntitlement: false }),
      false
    )
    assert.equal(
      canUseVoicePack(CREATOR_PACK, { isBuiltIn: false, isPatron: false, hasEntitlement: true }),
      true
    )
  })

  it('SPEC: the patron-only list names real built-in packs (no silent drift)', () => {
    const builtInIds = BUILT_IN_VOICE_PACKS.map((p) => p.id)
    for (const id of PATRON_ONLY_BUILT_IN_VOICE_PACK_IDS) {
      assert.ok(builtInIds.includes(id), `${id} is gated but is not a built-in pack`)
    }
    assert.ok(
      builtInIds.includes(FREE_DEFAULT_VOICE_PACK_ID as never),
      'the free default must be a pack that actually ships'
    )
  })

  it('a language pack id is never treated as patron-only', () => {
    assert.equal(isPatronOnlyBuiltInVoicePack('english'), false)
    assert.equal(isPatronOnlyBuiltInVoicePack(CREATOR_PACK), false)
    assert.equal(isPatronOnlyBuiltInVoicePack(null), false)
    assert.equal(isPatronOnlyBuiltInVoicePack(42), false)
  })

  it('SPEC: the viewer default is a pack they are actually allowed to hear', () => {
    // Leebo can no longer be everyone's default — a non-patron would be handed a
    // pack they may not use.
    assert.equal(defaultVoicePackIdForViewer(true), 'leebo')
    assert.equal(defaultVoicePackIdForViewer(false), FREE_DEFAULT_VOICE_PACK_ID)
    assert.equal(
      canUseVoicePack(defaultVoicePackIdForViewer(false), LANGUAGE),
      true,
      'the non-patron default must itself be usable by a non-patron'
    )
    assert.equal(PATRON_ONLY_BUILT_IN_VOICE_PACK_IDS.includes(FREE_DEFAULT_VOICE_PACK_ID as never), false)
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
