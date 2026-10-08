// @ts-nocheck
// Tests for scripts/sync-patrons-cron.ts
// Spec: U2 weekly reconciliation must auto-heal active-patron-missing-role
// mismatches when possible, surface unresolvable mismatches via shouldAlert,
// and never crash the cron over a heal failure (alert via log, exit 0).

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { shouldAlert } from './sync-patrons-cron.ts'

describe('shouldAlert', () => {
  it('SPEC: no mismatches → no alert', () => {
    assert.strictEqual(
      shouldAlert({
        total: 5,
        alreadyHadRole: 5,
        roleAdded: 0,
        notInServer: 0,
        failed: 0,
        mismatches: [],
      }),
      false,
    )
  })

  it('SPEC: only auto-healed mismatches → no alert (cron absorbed the drift)', () => {
    assert.strictEqual(
      shouldAlert({
        total: 5,
        alreadyHadRole: 4,
        roleAdded: 1,
        notInServer: 0,
        failed: 0,
        mismatches: [
          { discordId: 'd1', name: 'Alice', reason: 'active_patron_missing_role', action: 'auto_healed' },
        ],
      }),
      false,
    )
  })

  it('SPEC: active patron not in Discord guild + pending row recorded → no alert (Layer 1 handles it)', () => {
    // When the cron writes a patreon_pending row for an active-but-not-in-guild
    // patron, patron-status surfaces the "join the Pod Discord server" message
    // to the user on next session-load. No human intervention required.
    assert.strictEqual(
      shouldAlert({
        total: 5,
        alreadyHadRole: 3,
        roleAdded: 1,
        notInServer: 1,
        pendingRecorded: 1,
        failed: 0,
        mismatches: [
          { discordId: 'd1', name: 'Bob', reason: 'active_patron_not_in_discord_guild', action: 'pending_row_recorded' },
        ],
      }),
      false,
    )
  })

  it('SPEC: active patron not in Discord guild + no email to record → alert (manual followup)', () => {
    // recordNotInGuildPending requires an email; when Patreon doesn't return
    // one, the cron falls through to manual_followup_needed and alerts.
    assert.strictEqual(
      shouldAlert({
        total: 5,
        alreadyHadRole: 3,
        roleAdded: 1,
        notInServer: 1,
        pendingRecorded: 0,
        failed: 0,
        mismatches: [
          { discordId: 'd1', name: 'Bob', reason: 'active_patron_not_in_discord_guild', action: 'manual_followup_needed' },
        ],
      }),
      true,
    )
  })

  it('SPEC: heal failed → alert', () => {
    assert.strictEqual(
      shouldAlert({
        total: 5,
        alreadyHadRole: 4,
        roleAdded: 0,
        notInServer: 0,
        failed: 1,
        mismatches: [
          { discordId: 'd1', name: 'Carol', reason: 'active_patron_missing_role', action: 'heal_failed' },
        ],
      }),
      true,
    )
  })

  it('SPEC: dry-run mismatches → alert (operator needs to know drift exists)', () => {
    assert.strictEqual(
      shouldAlert({
        total: 5,
        alreadyHadRole: 4,
        roleAdded: 0,
        notInServer: 0,
        failed: 0,
        mismatches: [
          { discordId: 'd1', name: 'Dave', reason: 'active_patron_missing_role', action: 'dry_run_skipped' },
        ],
      }),
      true,
    )
  })

  it('SPEC: mixed bag (auto-healed + manual-followup) → alert (because of manual-followup)', () => {
    assert.strictEqual(
      shouldAlert({
        total: 10,
        alreadyHadRole: 7,
        roleAdded: 2,
        notInServer: 1,
        failed: 0,
        mismatches: [
          { discordId: 'd1', name: 'A', reason: 'active_patron_missing_role', action: 'auto_healed' },
          { discordId: 'd2', name: 'B', reason: 'active_patron_missing_role', action: 'auto_healed' },
          { discordId: 'd3', name: 'C', reason: 'active_patron_not_in_discord_guild', action: 'manual_followup_needed' },
        ],
      }),
      true,
    )
  })
})
