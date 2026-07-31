// Spec tests for sealed pack count as a format dimension (HARD SPLIT).
// SPEC: src/utils/sealedFormat.ts (1)-(4).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  sealedPackBucket,
  packBucketsMatch,
  packCountLabel,
  packCountNameSuffix,
  poolPackBucketSql,
  toPackBucket,
  LEGACY_SEALED_PACK_BUCKET,
} from './sealedFormat'

describe('sealedPackBucket', () => {
  it('SPEC 2: reports the length of the pool\'s own packs array', () => {
    assert.equal(sealedPackBucket({ poolType: 'sealed', packCount: 6 }), 6)
    assert.equal(sealedPackBucket({ poolType: 'sealed', packCount: 8 }), 8)
  })

  it('SPEC 2: a build (packs: null) inherits its parent pool\'s count', () => {
    assert.equal(
      sealedPackBucket({ poolType: 'sealed', packCount: null, parentPackCount: 8 }),
      8
    )
  })

  it('SPEC 2: the pool\'s own count wins over the parent\'s', () => {
    assert.equal(
      sealedPackBucket({ poolType: 'sealed', packCount: 6, parentPackCount: 8 }),
      6
    )
  })

  it('SPEC 1: only plain sealed pools carry a pack-count bucket', () => {
    for (const poolType of ['draft', 'chaos_sealed', 'pack_wars', 'pack_blitz', 'rotisserie', 'imported']) {
      assert.equal(
        sealedPackBucket({ poolType, packCount: 6 }),
        null,
        `${poolType} must not carry a pack-count bucket`
      )
    }
    assert.equal(sealedPackBucket({ poolType: null, packCount: 6 }), null)
    assert.equal(sealedPackBucket({ packCount: 6 }), null)
  })

  it('SPEC 3: a sealed pool with no packs recorded lands in the 6-pack bucket', () => {
    assert.equal(LEGACY_SEALED_PACK_BUCKET, 6)
    assert.equal(sealedPackBucket({ poolType: 'sealed' }), 6)
    assert.equal(sealedPackBucket({ poolType: 'sealed', packCount: null, parentPackCount: null }), 6)
    // A zero-length packs array carries no format information either.
    assert.equal(sealedPackBucket({ poolType: 'sealed', packCount: 0 }), 6)
  })

  it('SPEC 3: the legacy bucket is exactly ONE bucket — never both', () => {
    const legacy = sealedPackBucket({ poolType: 'sealed' })
    assert.equal(packBucketsMatch(legacy, 6), true)
    assert.equal(packBucketsMatch(legacy, 8), false)
  })

  it('accepts counts other than 6 and 8 (promo/event-pack pools)', () => {
    assert.equal(sealedPackBucket({ poolType: 'sealed', packCount: 3 }), 3)
  })
})

describe('packBucketsMatch — HARD SPLIT (SPEC 4)', () => {
  it('equal buckets are the same format', () => {
    assert.equal(packBucketsMatch(6, 6), true)
    assert.equal(packBucketsMatch(8, 8), true)
  })

  it('6-pack and 8-pack NEVER pair', () => {
    assert.equal(packBucketsMatch(6, 8), false)
    assert.equal(packBucketsMatch(8, 6), false)
  })

  it('there is no wildcard: a missing bucket does not open the gate', () => {
    assert.equal(packBucketsMatch(null, 8), false)
    assert.equal(packBucketsMatch(undefined, 8), false)
    assert.equal(packBucketsMatch(6, null), false)
    assert.equal(packBucketsMatch(6, undefined), false)
  })

  it('SPEC 1: two non-sealed formats (both null) are unaffected', () => {
    const draftA = sealedPackBucket({ poolType: 'draft', packCount: 3 })
    const draftB = sealedPackBucket({ poolType: 'draft', packCount: 4 })
    assert.equal(packBucketsMatch(draftA, draftB), true)
  })

  it('a sealed deck can never pair with a non-sealed one on this axis', () => {
    const sealed = sealedPackBucket({ poolType: 'sealed', packCount: 6 })
    const draft = sealedPackBucket({ poolType: 'draft' })
    assert.equal(packBucketsMatch(sealed, draft), false)
  })
})

describe('toPackBucket', () => {
  it('normalizes SQL/JSON payload values without inventing a bucket', () => {
    assert.equal(toPackBucket('8'), 8)
    assert.equal(toPackBucket(8), 8)
    assert.equal(toPackBucket(null), null)
    assert.equal(toPackBucket(undefined), null)
    assert.equal(toPackBucket(0), null)
    assert.equal(toPackBucket('nonsense'), null)
  })
})

describe('display name', () => {
  it('labels a known bucket', () => {
    assert.equal(packCountLabel(8), '8-pack')
    assert.equal(packCountLabel(6), '6-pack')
  })

  it('formats with no pack dimension get no label and no name suffix', () => {
    assert.equal(packCountLabel(null), '')
    assert.equal(packCountLabel(undefined), '')
    assert.equal(packCountNameSuffix(null), '')
  })

  it('the name suffix is a leading-space parenthetical, so it drops in before the date', () => {
    assert.equal(packCountNameSuffix(8), ' (8-pack)')
    assert.equal(`LAW Sealed Pool${packCountNameSuffix(8)} 07.30.26`, 'LAW Sealed Pool (8-pack) 07.30.26')
    assert.equal(`SEC Draft Pool${packCountNameSuffix(null)} 07.30.26`, 'SEC Draft Pool 07.30.26')
  })
})

describe('poolPackBucketSql', () => {
  it('mirrors the TS rule: non-sealed NULL, own packs, parent packs, legacy bucket', () => {
    const sql = poolPackBucketSql('cp', 'ppk')
    assert.match(sql, /cp\.pool_type IS DISTINCT FROM 'sealed'/)
    assert.match(sql, /jsonb_typeof\(cp\.packs\) = 'array'/)
    assert.match(sql, /jsonb_typeof\(ppk\.packs\) = 'array'/)
    assert.match(sql, /jsonb_array_length\(ppk\.packs\)/)
    // SPEC 3: the fallback is the legacy bucket, not NULL.
    assert.match(sql, new RegExp(`ELSE ${LEGACY_SEALED_PACK_BUCKET}`))
  })
})
