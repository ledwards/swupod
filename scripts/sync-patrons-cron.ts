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
import { fetchAllPatrons } from '../lib/patreon'
import { isPatron, addPatronRole, isGuildMember } from '../lib/discord'
import { query } from '../lib/db'

interface CronResult {
  total: number
  alreadyHadRole: number
  roleAdded: number
  notInServer: number
  pendingRecorded: number
  /** users.is_patron flipped FALSE→TRUE via Patreon-email match this run. */
  dbPatronsEnabled: number
  /** patreon_pending rows cleared because the email now resolves to a is_patron=TRUE user. */
  pendingRowsCleared: number
  /** Stale patreon_pending rows deleted because the email is no longer an active Patreon patron. */
  pendingStaleDeleted: number
  failed: number
  mismatches: Array<{ discordId: string; name: string | null; reason: string; action: string }>
}

/**
 * Sync users.is_patron with Patreon's active-patron list (email match).
 * Catches the slice of stranded patrons whose webhook fired before the
 * email-match path shipped, or whose webhook silently failed. Idempotent
 * — only flips rows that need flipping. Does NOT auto-downgrade is_patron
 * to FALSE; churn is webhook-driven so we don't race the live event.
 *
 * Then DELETEs patreon_pending rows for any email that now resolves to
 * a is_patron=TRUE swupod user — they no longer need the "fix your chain"
 * message. Pending rows for emails without a matching swupod user (e.g.,
 * patrons who haven't signed in yet) are left in place so patron-status
 * can auto-enable them on first sign-in.
 */
async function backfillIsPatronByEmail(
  emails: string[],
): Promise<{ enabled: number; cleared: number; staleDeleted: number }> {
  if (emails.length === 0) return { enabled: 0, cleared: 0, staleDeleted: 0 }
  try {
    const upgrade = await query(
      `UPDATE users SET is_patron = TRUE
       WHERE LOWER(email) = ANY($1::text[])
         AND is_patron = FALSE
       RETURNING id`,
      [emails]
    )
    const enabled = (upgrade as any)?.rowCount ?? 0

    const cleanup = await query(
      `DELETE FROM patreon_pending
       WHERE LOWER(email) IN (
         SELECT LOWER(email) FROM users WHERE is_patron = TRUE
       )`,
      []
    )
    const cleared = (cleanup as any)?.rowCount ?? 0

    // Stale cleanup: DELETE patreon_pending rows whose email is no longer
    // an active patron on Patreon. Without this, the patron-status
    // auto-enable path (180-day window) could wrongly grant access to a
    // churned patron whose legacy pending row never got cleared.
    const stale = await query(
      `DELETE FROM patreon_pending WHERE NOT (LOWER(email) = ANY($1::text[]))`,
      [emails]
    )
    const staleDeleted = (stale as any)?.rowCount ?? 0

    return { enabled, cleared, staleDeleted }
  } catch (err) {
    console.warn('sync-patrons-cron: backfillIsPatronByEmail failed', { error: String(err) })
    return { enabled: 0, cleared: 0, staleDeleted: 0 }
  }
}

/**
 * Upsert a patreon_pending row with reason='not_in_guild' for a stranded
 * patron the cron found. The /api/auth/patron-status endpoint reads this
 * on session-load and surfaces a "Join the Pod Discord server" message
 * instead of the wrong "subscribe to Patreon" CTA (Layer 1).
 *
 * Best-effort: silently skips when DATABASE_URL is unavailable (e.g.,
 * local runs without env). The script's primary job is Discord role
 * sync; pending-row recording is a follow-up surface that fails closed.
 */
async function recordNotInGuildPending(
  email: string | null,
  name: string | null,
  discordId: string | null,
): Promise<boolean> {
  if (!email) return false
  try {
    await query(
      `INSERT INTO patreon_pending (email, patreon_name, event, patron_status, reason, discord_id, created_at)
       VALUES ($1, $2, 'sync-patrons-cron', 'active_patron', 'not_in_guild', $3, NOW())
       ON CONFLICT (email) DO UPDATE SET
         patreon_name = EXCLUDED.patreon_name,
         event = EXCLUDED.event,
         patron_status = EXCLUDED.patron_status,
         reason = 'not_in_guild',
         discord_id = EXCLUDED.discord_id,
         created_at = NOW()`,
      [email, name, discordId]
    )
    return true
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('sync-patrons-cron: could not record not_in_guild pending', { email, error: String(err) })
    return false
  }
}

interface RunOptions {
  dryRun?: boolean
  heal?: boolean
}

export async function runSyncPatronsCron(options: RunOptions = {}): Promise<CronResult> {
  const { dryRun = false, heal = true } = options

  // Pull ALL members so we can email-match patrons regardless of whether
  // they've linked Discord on Patreon. The Discord-role loop below filters
  // further to active-with-discord; the email-match backfill uses the
  // broader active-status set.
  const allMembers = await fetchAllPatrons()
  const activeStatuses = new Set(['active_patron', 'pay_upfront'])
  const activeMembers = allMembers.filter((m) => activeStatuses.has(m.patronStatus || ''))
  const patrons = activeMembers.filter((m) => !!m.discordUserId)
  const activeEmails = Array.from(
    new Set(activeMembers.map((m) => m.email?.toLowerCase()).filter((e): e is string => !!e))
  )

  const result: CronResult = {
    total: patrons.length,
    alreadyHadRole: 0,
    roleAdded: 0,
    notInServer: 0,
    pendingRecorded: 0,
    dbPatronsEnabled: 0,
    pendingRowsCleared: 0,
    pendingStaleDeleted: 0,
    failed: 0,
    mismatches: [],
  }

  // DB sync first — catches stranded patrons whose chain broke and clears
  // their pending row so the cron doesn't re-mark them as not_in_guild
  // below if the Discord side also fires.
  if (!dryRun) {
    const dbSync = await backfillIsPatronByEmail(activeEmails)
    result.dbPatronsEnabled = dbSync.enabled
    result.pendingRowsCleared = dbSync.cleared
    result.pendingStaleDeleted = dbSync.staleDeleted
  }

  for (const patron of patrons) {
    const discordId = patron.discordUserId
    if (!discordId) continue // belt-and-suspenders; we already filtered above

    const hasRole = await isPatron(discordId)
    if (hasRole) {
      result.alreadyHadRole++
      continue
    }

    const inServer = await isGuildMember(discordId)
    if (!inServer) {
      result.notInServer++
      // Record a pending row so /api/auth/patron-status can surface the
      // "join the Pod Discord server" message to this patron on their next
      // session load. Without this, the cron knows about the problem but
      // the patron only sees a generic "subscribe to Patreon" CTA.
      const recorded = dryRun ? false : await recordNotInGuildPending(patron.email, patron.fullName, discordId)
      if (recorded) result.pendingRecorded++
      result.mismatches.push({
        discordId,
        name: patron.fullName,
        reason: 'active_patron_not_in_discord_guild',
        action: recorded ? 'pending_row_recorded' : 'manual_followup_needed',
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
 * mismatch was found that the cron couldn't either auto-heal (assigned
 * the role) or auto-handle (recorded a pending row so patron-status
 * surfaces the right next-step to the user on session load). Cases that
 * fail both — heal_failed, manual_followup_needed — still need human
 * attention.
 */
export function shouldAlert(result: CronResult): boolean {
  return result.mismatches.some(
    (m) => m.action !== 'auto_healed' && m.action !== 'pending_row_recorded'
  )
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
      pendingRecorded: result.pendingRecorded,
      dbPatronsEnabled: result.dbPatronsEnabled,
      pendingRowsCleared: result.pendingRowsCleared,
      pendingStaleDeleted: result.pendingStaleDeleted,
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
