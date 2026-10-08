// @ts-nocheck
// Tests for scripts/snapshot-patrons.ts
// Spec: U0 audit-trail snapshot must filter to active patrons, preserve null
// pledge fields, and upsert idempotently on conflict via patron_id.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildSnapshotRows, upsertSnapshotRows, __test } from './snapshot-patrons.ts'

describe('buildSnapshotRows', () => {
  it('SPEC: keeps only active_patron and pay_upfront statuses', () => {
    const members = [
      { patreonUserId: 'p1', fullName: 'Active', email: 'a@x.com', patronStatus: 'active_patron', discordUserId: 'd1', pledgeAmountCents: 500, pledgeStartedAt: '2024-01-01' },
      { patreonUserId: 'p2', fullName: 'Trial', email: 'b@x.com', patronStatus: 'pay_upfront', discordUserId: 'd2', pledgeAmountCents: 500, pledgeStartedAt: '2024-06-01' },
      { patreonUserId: 'p3', fullName: 'Former', email: 'c@x.com', patronStatus: 'former_patron', discordUserId: 'd3', pledgeAmountCents: null, pledgeStartedAt: null },
      { patreonUserId: 'p4', fullName: 'Declined', email: 'd@x.com', patronStatus: 'declined_patron', discordUserId: 'd4', pledgeAmountCents: 500, pledgeStartedAt: '2024-02-01' },
      { patreonUserId: 'p5', fullName: 'Null', email: 'e@x.com', patronStatus: null, discordUserId: null, pledgeAmountCents: null, pledgeStartedAt: null },
    ]
    const rows = buildSnapshotRows(members)
    assert.strictEqual(rows.length, 2, 'only active_patron and pay_upfront kept')
    assert.deepStrictEqual(
      rows.map((r) => r.patron_id).sort(),
      ['p1', 'p2'],
    )
  })

  it('SPEC: preserves null pledge fields rather than coercing to 0', () => {
    const members = [
      {
        patreonUserId: 'free-trial',
        fullName: 'Free Trial',
        email: 'ft@x.com',
        patronStatus: 'pay_upfront',
        discordUserId: 'discord-ft',
        pledgeAmountCents: null,
        pledgeStartedAt: null,
      },
    ]
    const rows = buildSnapshotRows(members)
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0].pledge_amount_cents, null, 'null pledge amount preserved')
    assert.strictEqual(rows[0].pledge_started_at, null, 'null pledge start preserved')
  })

  it('SPEC: maps all PatreonMember fields onto snake_case snapshot row', () => {
    const members = [
      {
        patreonUserId: 'p-abc',
        fullName: 'Test Patron',
        email: 'test@example.com',
        patronStatus: 'active_patron',
        discordUserId: 'discord-abc',
        pledgeAmountCents: 1000,
        pledgeStartedAt: '2024-08-15T12:00:00Z',
      },
    ]
    const rows = buildSnapshotRows(members)
    assert.deepStrictEqual(rows[0], {
      patron_id: 'p-abc',
      discord_id: 'discord-abc',
      email: 'test@example.com',
      full_name: 'Test Patron',
      patron_status: 'active_patron',
      pledge_amount_cents: 1000,
      pledge_started_at: '2024-08-15T12:00:00Z',
    })
  })

  it('SPEC: handles patrons without Discord linked', () => {
    const members = [
      {
        patreonUserId: 'no-discord',
        fullName: 'No Discord',
        email: 'nd@x.com',
        patronStatus: 'active_patron',
        discordUserId: null,
        pledgeAmountCents: 500,
        pledgeStartedAt: '2024-01-01',
      },
    ]
    const rows = buildSnapshotRows(members)
    assert.strictEqual(rows.length, 1, 'patrons without Discord are still snapshotted')
    assert.strictEqual(rows[0].discord_id, null)
  })

  it('returns empty array when no active members', () => {
    assert.deepStrictEqual(buildSnapshotRows([]), [])
    assert.deepStrictEqual(
      buildSnapshotRows([
        { patreonUserId: 'p1', fullName: null, email: null, patronStatus: 'former_patron', discordUserId: null, pledgeAmountCents: null, pledgeStartedAt: null },
      ]),
      [],
    )
  })
})

describe('upsertSnapshotRows — idempotency contract', () => {
  it('SPEC: uses ON CONFLICT (patron_id) DO UPDATE so re-runs do not duplicate', async () => {
    // The SQL itself is the spec — verify the upsert clause is present.
    assert.ok(
      __test.UPSERT_SQL.includes('ON CONFLICT (patron_id) DO UPDATE'),
      'UPSERT_SQL must use ON CONFLICT (patron_id) DO UPDATE',
    )
    assert.ok(
      __test.UPSERT_SQL.includes('snapshot_at = NOW()'),
      'UPSERT_SQL must refresh snapshot_at on conflict',
    )
  })

  it('SPEC: calls client.query once per row with positional params', async () => {
    const calls = []
    const stubClient = {
      async query(sql, params) {
        calls.push({ sql, params })
        return { rowCount: 1 }
      },
    }
    const rows = [
      { patron_id: 'a', discord_id: 'da', email: 'a@x', full_name: 'A', patron_status: 'active_patron', pledge_amount_cents: 500, pledge_started_at: '2024-01-01' },
      { patron_id: 'b', discord_id: null, email: 'b@x', full_name: 'B', patron_status: 'pay_upfront', pledge_amount_cents: null, pledge_started_at: null },
    ]
    const inserted = await upsertSnapshotRows(stubClient, rows)
    assert.strictEqual(inserted, 2, 'returned count matches rows processed')
    assert.strictEqual(calls.length, 2, 'one query per row')
    // Param order: patron_id, discord_id, email, full_name, patron_status, pledge_amount_cents, pledge_started_at
    assert.deepStrictEqual(calls[0].params, ['a', 'da', 'a@x', 'A', 'active_patron', 500, '2024-01-01'])
    assert.deepStrictEqual(calls[1].params, ['b', null, 'b@x', 'B', 'pay_upfront', null, null])
  })

  it('SPEC: empty input is a no-op (does not call client.query)', async () => {
    const calls = []
    const stubClient = {
      async query(sql, params) {
        calls.push({ sql, params })
        return { rowCount: 0 }
      },
    }
    const inserted = await upsertSnapshotRows(stubClient, [])
    assert.strictEqual(inserted, 0)
    assert.strictEqual(calls.length, 0, 'no DB calls on empty input')
  })

  it('SPEC: error from client.query bubbles up (caller handles)', async () => {
    const stubClient = {
      async query() {
        throw new Error('connection refused')
      },
    }
    const rows = [
      { patron_id: 'a', discord_id: null, email: null, full_name: null, patron_status: 'active_patron', pledge_amount_cents: 500, pledge_started_at: null },
    ]
    await assert.rejects(
      () => upsertSnapshotRows(stubClient, rows),
      /connection refused/,
      'DB error must propagate (not silently swallowed)',
    )
  })
})
