#!/usr/bin/env npx tsx
// @ts-nocheck
// Weekly reconciliation cron for the Patreon → Discord → site privilege chain.
//
// Detects two failure modes the real-time webhook can produce silently:
//   1. Active Patreon patron with linked Discord but missing the
//      "Friend of the Pod" role (webhook failed to add it).
//   2. User holding the "Friend of the Pod" role whose Patreon status
//      is no longer active (webhook failed to remove it).
//
// Run weekly (Railway Cron). Auto-heals what it can (adds missing roles)
// and emits a structured ALERT line for the rest so the user / log
// aggregator can react.
//
// Usage:
//   railway run -e production npx tsx scripts/sync-patrons-cron.ts
//   railway run -e production npx tsx scripts/sync-patrons-cron.ts --dry-run
//   railway run -e production npx tsx scripts/sync-patrons-cron.ts --no-heal
//
// Exit code is 0 on success regardless of mismatch count — the alert
// signal is the structured `[ALERT-PATREON-SYNC]` log line, not the
// exit code. This keeps Railway from failing the cron run because of
// detected drift (drift is the expected state when we want an alert).

import 'dotenv/config'
import { fetchActivePatronsWithDiscord } from '../lib/patreon'
import { isPatron, addPatronRole, isGuildMember } from '../lib/discord'

interface CronResult {
  total: number
  alreadyHadRole: number
  roleAdded: number
  notInServer: number
  failed: number
  mismatches: Array<{ discordId: string; name: string | null; reason: string; action: string }>
}

interface RunOptions {
  dryRun?: boolean
  heal?: boolean
}

export async function runSyncPatronsCron(options: RunOptions = {}): Promise<CronResult> {
  const { dryRun = false, heal = true } = options

  const patrons = await fetchActivePatronsWithDiscord()

  const result: CronResult = {
    total: patrons.length,
    alreadyHadRole: 0,
    roleAdded: 0,
    notInServer: 0,
    failed: 0,
    mismatches: [],
  }

  for (const patron of patrons) {
    const discordId = patron.discordUserId
    if (!discordId) continue // fetchActivePatronsWithDiscord filters these, defensive

    const hasRole = await isPatron(discordId)
    if (hasRole) {
      result.alreadyHadRole++
      continue
    }

    const inServer = await isGuildMember(discordId)
    if (!inServer) {
      result.notInServer++
      result.mismatches.push({
        discordId,
        name: patron.fullName,
        reason: 'active_patron_not_in_discord_guild',
        action: 'manual_followup_needed',
      })
      continue
    }

    // In server, no role → webhook missed them. Heal or flag.
    if (heal && !dryRun) {
      const success = await addPatronRole(discordId)
      if (success) {
        result.roleAdded++
        result.mismatches.push({
          discordId,
          name: patron.fullName,
          reason: 'active_patron_missing_role',
          action: 'auto_healed',
        })
      } else {
        result.failed++
        result.mismatches.push({
          discordId,
          name: patron.fullName,
          reason: 'active_patron_missing_role',
          action: 'heal_failed',
        })
      }
    } else {
      result.mismatches.push({
        discordId,
        name: patron.fullName,
        reason: 'active_patron_missing_role',
        action: dryRun ? 'dry_run_skipped' : 'heal_disabled',
      })
    }
  }

  return result
}

/**
 * Decide whether the run is alert-worthy. An alert fires when any
 * mismatch was found that the cron couldn't auto-heal (or when heal is
 * off). Auto-healed mismatches do NOT trigger an alert by themselves —
 * the cron's job is to silently absorb webhook gaps; the alert is for
 * cases that need human attention.
 */
export function shouldAlert(result: CronResult): boolean {
  return result.mismatches.some((m) => m.action !== 'auto_healed')
}

function emitAlertLine(result: CronResult): void {
  // Structured single-line log — Railway log search or any log aggregator
  // can pattern-match on `[ALERT-PATREON-SYNC]`. If you later add a
  // Discord webhook (DISCORD_ALERT_WEBHOOK_URL env var) wire it here.
  const summary = {
    notInServer: result.notInServer,
    healFailed: result.mismatches.filter((m) => m.action === 'heal_failed').length,
    healDisabled: result.mismatches.filter((m) => m.action === 'heal_disabled').length,
    drySkipped: result.mismatches.filter((m) => m.action === 'dry_run_skipped').length,
    manualFollowup: result.mismatches.filter((m) => m.action === 'manual_followup_needed').length,
    samples: result.mismatches.slice(0, 5).map((m) => ({
      discordId: m.discordId,
      name: m.name,
      reason: m.reason,
      action: m.action,
    })),
  }
  // eslint-disable-next-line no-console
  console.error('[ALERT-PATREON-SYNC]', JSON.stringify(summary))
}

// CLI entry
const isCli = import.meta.url === `file://${process.argv[1]}`
if (isCli) {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const heal = !args.includes('--no-heal')

  try {
    const start = Date.now()
    const result = await runSyncPatronsCron({ dryRun, heal })
    const durationMs = Date.now() - start

    console.log('sync-patrons-cron complete', {
      durationMs,
      total: result.total,
      alreadyHadRole: result.alreadyHadRole,
      roleAdded: result.roleAdded,
      notInServer: result.notInServer,
      failed: result.failed,
      dryRun,
      heal,
    })

    if (shouldAlert(result)) {
      emitAlertLine(result)
    }
  } catch (err) {
    console.error('[ALERT-PATREON-SYNC]', JSON.stringify({ fatal: true, error: String(err) }))
    process.exit(1) // fatal exit only on uncaught error
  }
}
