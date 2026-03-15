#!/usr/bin/env npx tsx
// Diagnostic script for Patreon → Discord role sync
// Run: railway run -e production npx tsx scripts/diagnose-patreon.ts

import { fetchAllPatrons, fetchActivePatronsWithDiscord } from '../lib/patreon'
import { isPatron, isGuildMember } from '../lib/discord'

async function main() {
  console.log('=== Patreon → Discord Role Diagnostic ===\n')

  // 1. Check env vars
  console.log('📋 Environment Variables:')
  const vars = [
    'PATREON_CREATOR_ACCESS_TOKEN',
    'PATREON_CAMPAIGN_ID',
    'PATREON_WEBHOOK_SECRET',
    'DISCORD_BOT_TOKEN',
    'DISCORD_GUILD_ID',
    'DISCORD_FRIEND_OF_THE_POD_ROLE_ID',
  ]
  for (const v of vars) {
    const val = process.env[v]
    console.log(`  ${val ? '✅' : '❌'} ${v}: ${val ? `set (${val.slice(0, 6)}...)` : 'MISSING'}`)
  }
  console.log()

  // 2. Fetch all patrons from Patreon API
  console.log('📥 Fetching all patrons from Patreon API...')
  let allPatrons: Awaited<ReturnType<typeof fetchAllPatrons>>
  try {
    allPatrons = await fetchAllPatrons()
    console.log(`  ✅ Found ${allPatrons.length} total members\n`)
  } catch (err) {
    console.error(`  ❌ Failed to fetch patrons: ${err}`)
    process.exit(1)
  }

  // 3. Break down by status
  const byStatus = new Map<string, number>()
  for (const p of allPatrons) {
    const status = p.patronStatus || 'null'
    byStatus.set(status, (byStatus.get(status) || 0) + 1)
  }
  console.log('📊 Members by patron_status:')
  for (const [status, count] of byStatus) {
    console.log(`  ${status}: ${count}`)
  }
  console.log()

  // 4. Check Discord connections
  const withDiscord = allPatrons.filter(p => p.discordUserId)
  const withoutDiscord = allPatrons.filter(p => !p.discordUserId)
  console.log(`🔗 Discord connections:`)
  console.log(`  With Discord linked: ${withDiscord.length}`)
  console.log(`  Without Discord: ${withoutDiscord.length}`)
  if (withoutDiscord.length > 0) {
    console.log(`  ⚠️  Members without Discord:`)
    for (const p of withoutDiscord) {
      console.log(`    - ${p.fullName || 'unknown'} (${p.email || 'no email'}) [status: ${p.patronStatus || 'null'}]`)
    }
  }
  console.log()

  // 5. Check active patrons with Discord — do they have the role?
  const activeWithDiscord = await fetchActivePatronsWithDiscord()
  console.log(`🎯 Active patrons with Discord: ${activeWithDiscord.length}`)
  console.log('  Checking role status for each...\n')

  let hasRole = 0
  let missingRole = 0
  let notInServer = 0

  for (const p of activeWithDiscord) {
    const discordId = p.discordUserId!
    const inServer = await isGuildMember(discordId)
    if (!inServer) {
      notInServer++
      console.log(`  ❌ ${p.fullName || 'unknown'} (Discord: ${discordId}) — NOT in server`)
      continue
    }
    const patron = await isPatron(discordId)
    if (patron) {
      hasRole++
      console.log(`  ✅ ${p.fullName || 'unknown'} (Discord: ${discordId}) — has role`)
    } else {
      missingRole++
      console.log(`  ⚠️  ${p.fullName || 'unknown'} (Discord: ${discordId}) — MISSING role`)
    }
  }

  console.log(`\n📊 Summary:`)
  console.log(`  ✅ Has role: ${hasRole}`)
  console.log(`  ⚠️  Missing role: ${missingRole}`)
  console.log(`  ❌ Not in server: ${notInServer}`)

  // 6. Also check non-active patrons with Discord (free trial, etc.)
  const nonActiveWithDiscord = allPatrons.filter(p => p.discordUserId && p.patronStatus !== 'active_patron')
  if (nonActiveWithDiscord.length > 0) {
    console.log(`\n🆓 Non-active members with Discord (free trial, former, etc.):`)
    for (const p of nonActiveWithDiscord) {
      console.log(`  - ${p.fullName || 'unknown'} (Discord: ${p.discordUserId}) [status: ${p.patronStatus || 'null'}]`)
    }
  }

  console.log('\n✅ Diagnostic complete!')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
