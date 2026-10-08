// Spec tests for the creator voice-pack domain rules.
//
// SPEC (plans Phase 3 + user's brief):
//   - A fixed, ordered list of clip slots. The cue engine, the API URL shape and
//     the live CHECK constraint must all agree on it. Adding a slot means: the
//     constant, a migration that rewrites the constraint, a CLIP_GUIDE entry, and
//     audio in every built-in pack (`npm run voice:generate`).
//   - Redemption codes are stored normalized (whitespace stripped, uppercased) so one
//     code can never become two packs.
//   - An invite opens the creator form for a NEW pack only while unused AND unexpired.
//   - Once an invite HAS published a pack the same link is that creator's durable
//     edit handle: it resolves forever, populated, and submitting updates in place.
//   - Leebo is not special: he is the FIRST CREATOR PACK, published by Protect the
//     Pod and seeded into voice_packs by migration 086. He is locked without an
//     entitlement, unlocked by redeeming LEEBO, and included for a Friend of the Pod
//     — exactly like every other creator pack.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
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
  clampInviteExpiryDays,
  INVITE_EXPIRY_DAYS_DEFAULT,
  INVITE_EXPIRY_DAYS_MIN,
  INVITE_EXPIRY_DAYS_MAX,
} from './voicePacks'
import { BUILT_IN_VOICE_PACKS } from '../utils/voicePackAssets'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('voice pack clip types', () => {
  it('SPEC: is exactly these cue slots, in cue order', () => {
    assert.deepEqual(VOICE_PACK_CLIP_TYPES as readonly string[], [
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

  it('SPEC: the live CHECK constraint allows exactly these ids', () => {
    // 080 created the constraint and is already applied in production, so it can
    // never be edited; each new clip ships a migration that drops and recreates
    // it. The live shape is therefore whichever of those migrations sorts last —
    // found rather than named, because naming it meant this test had to be
    // hand-edited every time a cue was added, which is precisely when it should
    // be the thing doing the checking.
    const migrationsDir = join(REPO_ROOT, 'migrations')
    const constraintMigrations = readdirSync(migrationsDir)
      .filter(name => name.endsWith('.sql'))
      .filter(name =>
        readFileSync(join(migrationsDir, name), 'utf8')
          .includes('ADD CONSTRAINT voice_pack_assets_clip_type_check')
      )
      .sort()
    assert.ok(constraintMigrations.length > 0, 'no migration defines the clip_type constraint')

    const latest = constraintMigrations[constraintMigrations.length - 1]
    const sql = readFileSync(join(migrationsDir, latest), 'utf8')
    const check = sql.slice(sql.indexOf('ADD CONSTRAINT voice_pack_assets_clip_type_check'))
    for (const clip of VOICE_PACK_CLIP_TYPES) {
      assert.ok(check.includes(`'${clip}'`), `${latest} is missing '${clip}'`)
    }
    const quoted = check.match(/'[a-z0-9-]+'/g) ?? []
    assert.equal(quoted.length, VOICE_PACK_CLIP_TYPES.length, `${latest} allows a different number of ids`)
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
    // everything published except 'time-is-up', which the upload also omits
    const published = VOICE_PACK_CLIP_TYPES.filter(c => c !== 'time-is-up' && c !== 'count-5')
    assert.deepEqual(missingVoicePackClips(['count-5'], published), ['time-is-up'])
  })

  it('returns the missing slots in cue order, never duplicated', () => {
    assert.deepEqual(
      missingVoicePackClips(['count-5', 'count-5'], ['greeting']),
      VOICE_PACK_CLIP_TYPES.filter(c => c !== 'greeting' && c !== 'count-5')
    )
  })

  it('ignores ids that are not cue slots', () => {
    // Unknown ids contribute nothing, so the unpublished tail stays missing.
    const published = VOICE_PACK_CLIP_TYPES.slice(0, -2)
    assert.deepEqual(
      missingVoicePackClips(['logo', 'count-10'], published),
      VOICE_PACK_CLIP_TYPES.slice(-2)
    )
  })
})

describe('who may use which voice pack', () => {
  const BUILT_IN = { isBuiltIn: true, isPatron: false, hasEntitlement: false }

  it('SPEC: the language packs are free to everyone, signed in or not', () => {
    // BUILT_IN_VOICE_PACKS is exactly the language packs now, and every one of them
    // is usable with no patron flag and no entitlement.
    for (const pack of BUILT_IN_VOICE_PACKS) {
      assert.equal(canUseVoicePack(BUILT_IN), true, `${pack.id} must be free`)
    }
  })

  it('SPEC: Leebo is an ORDINARY creator pack — locked until it is unlocked', () => {
    // He is a voice_packs row (migration 086), so he goes through the same rule as
    // anyone else's pack. There is no id in this call at all: the tiers turn on what
    // is true of the pack, never on which pack it is.
    assert.equal(
      canUseVoicePack({ isBuiltIn: false, isPatron: false, hasEntitlement: false }),
      false,
      'no pledge and no code means no Leebo'
    )
    assert.equal(
      canUseVoicePack({ isBuiltIn: false, isPatron: false, hasEntitlement: true }),
      true,
      'redeeming LEEBO unlocks him permanently, patron or not'
    )
    assert.equal(
      canUseVoicePack({ isBuiltIn: false, isPatron: true, hasEntitlement: false }),
      true,
      'a Friend of the Pod gets him without redeeming'
    )
  })

  it('SPEC: a Friend of the Pod gets every creator pack without redeeming', () => {
    assert.equal(
      canUseVoicePack({ isBuiltIn: false, isPatron: true, hasEntitlement: false }),
      true
    )
  })

  it('SPEC: everyone else gets a creator pack only by redeeming its code', () => {
    assert.equal(
      canUseVoicePack({ isBuiltIn: false, isPatron: false, hasEntitlement: false }),
      false
    )
    assert.equal(
      canUseVoicePack({ isBuiltIn: false, isPatron: false, hasEntitlement: true }),
      true
    )
  })

  it('SPEC: the rule cannot special-case a pack id — it is not given one', () => {
    // The regression this guards: Leebo used to be a hardcoded exception in here.
    // Taking only the access facts makes that class of bug unexpressible.
    assert.equal(canUseVoicePack.length, 1)
  })

  it('SPEC: no built-in pack needs an unlock', () => {
    // "Built in" means free, with no exceptions to remember.
    assert.equal(canUseVoicePack({ isBuiltIn: true, isPatron: false, hasEntitlement: false }), true)
    assert.equal(BUILT_IN_VOICE_PACKS.some((p) => p.id === 'leebo'), false,
      'Leebo must not be in the shipped set — he is a database row')
  })
})

describe('Leebo ships as data, not as code', () => {
  const MIGRATION = join(REPO_ROOT, 'migrations', '086_seed_leebo_voice_pack.js')

  it('SPEC: migration 086 publishes him as a creator pack with the code LEEBO', () => {
    const js = readFileSync(MIGRATION, 'utf8')
    assert.match(js, /code: 'LEEBO'/)
    assert.match(js, /displayName: 'Leebo'/)
    assert.match(js, /creatorName: 'Protect the Pod'/)
    assert.match(js, /INSERT INTO voice_packs/)
    assert.match(js, /'active'/)
    assert.match(js, /ON CONFLICT \(code\) DO NOTHING/, 're-running must not duplicate the pack')
    assert.match(
      js,
      /ON CONFLICT \(pack_id, clip_type\) DO NOTHING/,
      're-running must not clobber a re-recorded clip'
    )
  })

  it('SPEC: every cue slot has a file for the seed to insert', () => {
    // Count derived from the clip list, never hardcoded: adding a cue slot must fail
    // here until its audio exists.
    const dir = join(REPO_ROOT, 'migrations', 'assets', 'leebo')
    const present = VOICE_PACK_CLIP_TYPES.filter((clip) => existsSync(join(dir, `${clip}.mp3`)))
    assert.equal(present.length, VOICE_PACK_CLIP_TYPES.length,
      `missing audio for: ${VOICE_PACK_CLIP_TYPES.filter((c) => !present.includes(c)).join(', ')}`)
    assert.ok(existsSync(join(dir, 'logo.png')), 'the pack needs a logo to publish')
  })

  it('SPEC: his audio is NOT served from the public web root', () => {
    // A pack you redeem a code for should not also be downloadable at a guessable
    // static URL. The bytes live where only the migration reads them.
    assert.equal(existsSync(join(REPO_ROOT, 'public', 'sounds', 'voice-packs', 'leebo')), false)
    assert.equal(existsSync(join(REPO_ROOT, 'public', 'icons', 'voice-packs', 'leebo.png')), false)
  })

  it('SPEC: migration 085 puts the entitlement schema back the way 080 declared it', () => {
    // 084 (never deployed) made pack_id nullable and added builtin_pack_id so a
    // built-in could be unlocked. With Leebo in the database there is nothing left
    // to model, and its reserved-code CHECK would have forbidden the very code 086
    // inserts.
    const sql = readFileSync(
      join(REPO_ROOT, 'migrations', '085_revert_builtin_voice_pack_entitlements.sql'),
      'utf8'
    )
    assert.match(sql, /DROP COLUMN IF EXISTS builtin_pack_id/)
    assert.match(sql, /ALTER COLUMN pack_id SET NOT NULL/)
    assert.match(sql, /DROP CONSTRAINT IF EXISTS voice_packs_code_not_reserved/)
    assert.match(sql, /DROP INDEX IF EXISTS idx_voice_pack_entitlements_user_builtin/)
  })

  it('SPEC: no migration reserves LEEBO against creator packs any more', () => {
    // A leftover CHECK would block the seed on a fresh database.
    const dir = join(REPO_ROOT, 'migrations')
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(dir, file), 'utf8')
      const addsReservedCheck = /ADD CONSTRAINT voice_packs_code_not_reserved/.test(sql)
      assert.equal(addsReservedCheck, false, `${file} still reserves the code`)
    }
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
