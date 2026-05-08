// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getBuildName,
  getBuildDeckBuilderState,
  shouldBuildFromSharedPool,
  formatPoolDate,
  stripArchetypeSetAndFormat,
  getDefaultPoolName,
  getDefaultBuildName,
  getCanonicalPoolSubtitle,
  findUserBuild,
} from './deckBuilderSharing'

describe('deckBuilderSharing', () => {
  describe('shouldBuildFromSharedPool', () => {
    it('builds for a non-owner opening a shared sealed pool', () => {
      assert.strictEqual(
        shouldBuildFromSharedPool({
          isOwner: false,
          shareId: 'pool-123',
          draftShareId: null,
        }),
        true
      )
    })

    it('does not build for the pool owner', () => {
      assert.strictEqual(
        shouldBuildFromSharedPool({
          isOwner: true,
          shareId: 'pool-123',
          draftShareId: null,
        }),
        false
      )
    })

    it('does not build for pod flows that already have their own destination', () => {
      assert.strictEqual(
        shouldBuildFromSharedPool({
          isOwner: false,
          shareId: 'pool-123',
          draftShareId: 'draft-456',
        }),
        false
      )
    })

    it('does not build in infinite mode', () => {
      assert.strictEqual(
        shouldBuildFromSharedPool({
          isInfiniteMode: true,
          isOwner: false,
          shareId: 'pool-123',
        }),
        false
      )
    })
  })

  describe('getBuildName', () => {
    it('appends builder name with em dash separator', () => {
      assert.strictEqual(getBuildName('SOR Sealed', 'Lee Edwards'), 'SOR Sealed – Lee Edwards\'s Build')
    })

    it('uses anonymous fallback when display name is null', () => {
      assert.strictEqual(getBuildName('SOR Sealed', null), 'SOR Sealed (Build)')
    })

    it('returns null when there is no parent name', () => {
      assert.strictEqual(getBuildName(null, 'Lee Edwards'), null)
    })
  })

  describe('getBuildDeckBuilderState', () => {
    it('prefers the current in-memory deck state over stale saved state', () => {
      const currentState = {
        activeLeader: 'leader-2',
        activeBase: 'base-2',
        cardPositions: {
          'pool-1': { section: 'deck' },
        },
      }
      const fallbackState = {
        activeLeader: 'leader-1',
        activeBase: 'base-1',
        cardPositions: {
          'pool-1': { section: 'sideboard' },
        },
      }

      assert.deepStrictEqual(getBuildDeckBuilderState(currentState, fallbackState), currentState)
    })

    it('falls back when there is no usable current state', () => {
      const fallbackState = { activeLeader: 'leader-1' }
      assert.deepStrictEqual(getBuildDeckBuilderState(null, fallbackState), fallbackState)
      assert.deepStrictEqual(getBuildDeckBuilderState({}, fallbackState), fallbackState)
    })
  })

  describe('formatPoolDate', () => {
    it('formats Date as MM.DD.YY', () => {
      assert.strictEqual(formatPoolDate(new Date(2026, 4, 28)), '05.28.26')
    })
    it('returns empty string for nullish input', () => {
      assert.strictEqual(formatPoolDate(null), '')
      assert.strictEqual(formatPoolDate(undefined), '')
    })
  })

  describe('stripArchetypeSetAndFormat', () => {
    it('strips trailing (Limited)/(Premiere)', () => {
      assert.strictEqual(stripArchetypeSetAndFormat('Mothma Blue (Limited)'), 'Mothma Blue')
      assert.strictEqual(stripArchetypeSetAndFormat('Pryce Green (Premiere)'), 'Pryce Green')
    })
    it('strips embedded (SET) tokens like (LAW) or (SOR)', () => {
      assert.strictEqual(stripArchetypeSetAndFormat('Han Solo (SOR) - Yellow 30'), 'Han Solo - Yellow 30')
      assert.strictEqual(stripArchetypeSetAndFormat('Saw Splash Blue (LAW) (Limited)'), 'Saw Splash Blue')
    })
  })

  describe('getDefaultPoolName', () => {
    it('formats as "{owner}\'s {SET} {Sealed|Draft} Pool {date}"', () => {
      assert.strictEqual(
        getDefaultPoolName({ ownerName: 'terronk', setCode: 'LAW', poolType: 'sealed', createdAt: new Date(2026, 4, 28) }),
        "terronk's LAW Sealed Pool 05.28.26"
      )
      assert.strictEqual(
        getDefaultPoolName({ ownerName: 'terronk', setCode: 'SOR', poolType: 'draft', createdAt: new Date(2026, 4, 28) }),
        "terronk's SOR Draft Pool 05.28.26"
      )
    })
    it('omits owner part when ownerName is missing', () => {
      assert.strictEqual(
        getDefaultPoolName({ ownerName: null, setCode: 'LAW', poolType: 'sealed', createdAt: new Date(2026, 4, 28) }),
        'LAW Sealed Pool 05.28.26'
      )
    })
  })

  describe('getDefaultBuildName', () => {
    it('formats as "{archetype} ({SET}) {Format} {date}"', () => {
      assert.strictEqual(
        getDefaultBuildName({
          archetypeNickname: 'Saw Splash Blue (Limited)',
          setCode: 'LAW',
          poolType: 'sealed',
          createdAt: new Date(2026, 4, 28),
        }),
        'Saw Splash Blue (LAW) Sealed 05.28.26'
      )
    })
    it('falls back to legacy {parent} – {user}\'s Build when no archetype', () => {
      assert.strictEqual(
        getDefaultBuildName({ parentName: 'SOR Sealed', displayName: 'Lee' }),
        "SOR Sealed – Lee's Build"
      )
    })
  })

  describe('getCanonicalPoolSubtitle', () => {
    it('produces "{SET} {Format} by {owner} {date}"', () => {
      assert.strictEqual(
        getCanonicalPoolSubtitle({ ownerName: 'terronk', setCode: 'LAW', poolType: 'sealed', createdAt: new Date(2026, 4, 28) }),
        'LAW Sealed by terronk 05.28.26'
      )
    })
  })

  describe('findUserBuild — replaces server-side dedup', () => {
    const builds = [
      // Root pool (the parent). Must be ignored by find logic.
      { shareId: 'root1', builderUserId: 'terronk', isOriginal: true, createdAt: '2026-05-01T00:00:00Z' },
      // terronk has TWO builds — most recent wins.
      { shareId: 'buildA', builderUserId: 'terronk', isOriginal: false, createdAt: '2026-05-02T00:00:00Z' },
      { shareId: 'buildB', builderUserId: 'terronk', isOriginal: false, createdAt: '2026-05-04T12:00:00Z' },
      // Another user's build — should be ignored.
      { shareId: 'buildC', builderUserId: 'someone-else', isOriginal: false, createdAt: '2026-05-05T00:00:00Z' },
      // Anonymous build — should be ignored even when currentUserId is set.
      { shareId: 'buildD', builderUserId: null, isOriginal: false, createdAt: '2026-05-06T00:00:00Z' },
    ]

    it('returns the most-recently-created non-original build owned by the current user', () => {
      const result = findUserBuild(builds, 'terronk')
      assert.strictEqual(result?.shareId, 'buildB')
    })

    it('returns null when the user has no builds for this pool', () => {
      assert.strictEqual(findUserBuild(builds, 'no-such-user'), null)
    })

    it('returns null for anonymous (null) currentUserId — anon users always create new', () => {
      assert.strictEqual(findUserBuild(builds, null), null)
      assert.strictEqual(findUserBuild(builds, undefined), null)
      assert.strictEqual(findUserBuild(builds, ''), null)
    })

    it('skips the root pool even when its builderUserId matches the current user', () => {
      // The root entry has isOriginal: true; matching it would be wrong (the user
      // would re-Play the original deck instead of their own build).
      const onlyRoot = [
        { shareId: 'root1', builderUserId: 'terronk', isOriginal: true, createdAt: '2026-05-01T00:00:00Z' },
      ]
      assert.strictEqual(findUserBuild(onlyRoot, 'terronk'), null)
    })

    it('returns null for empty/missing builds list', () => {
      assert.strictEqual(findUserBuild([], 'terronk'), null)
      assert.strictEqual(findUserBuild(null, 'terronk'), null)
      assert.strictEqual(findUserBuild(undefined, 'terronk'), null)
    })

    it('handles builds with missing createdAt — returns one of the matching ones', () => {
      const noTimestamps = [
        { shareId: 'a', builderUserId: 'u', isOriginal: false },
        { shareId: 'b', builderUserId: 'u', isOriginal: false },
      ]
      const result = findUserBuild(noTimestamps, 'u')
      assert.ok(result?.shareId === 'a' || result?.shareId === 'b')
    })

    it('ignores other users when one user has many builds', () => {
      // Same user with many builds; another user with a more recent build —
      // we should still get terronk's most-recent, not the other user's.
      const mixed = [
        { shareId: 'mine1', builderUserId: 'terronk', isOriginal: false, createdAt: '2026-05-01T00:00:00Z' },
        { shareId: 'mine2', builderUserId: 'terronk', isOriginal: false, createdAt: '2026-05-02T00:00:00Z' },
        { shareId: 'theirs', builderUserId: 'other', isOriginal: false, createdAt: '2026-12-31T00:00:00Z' },
      ]
      const result = findUserBuild(mixed, 'terronk')
      assert.strictEqual(result?.shareId, 'mine2')
    })
  })
})
