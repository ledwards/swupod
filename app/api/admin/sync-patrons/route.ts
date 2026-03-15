// @ts-nocheck
// POST /api/admin/sync-patrons - Sync Patreon patron roles to Discord
// Fetches all active patrons from Patreon API, checks their Discord role,
// and adds the "Friend of the Pod" role to anyone missing it.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/utils'
import { fetchActivePatronsWithDiscord } from '@/lib/patreon'
import { isPatron, addPatronRole, isGuildMember } from '@/lib/discord'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    requireAdmin(request)

    const patrons = await fetchActivePatronsWithDiscord()

    const results = {
      total: patrons.length,
      alreadyHadRole: 0,
      roleAdded: 0,
      notInServer: 0,
      failed: 0,
      details: [] as { discordId: string; name: string | null; action: string }[],
    }

    for (const patron of patrons) {
      const discordId = patron.discordUserId!

      // Check if they already have the role
      const hasRole = await isPatron(discordId)
      if (hasRole) {
        results.alreadyHadRole++
        continue
      }

      // Check if they're in the server
      const inServer = await isGuildMember(discordId)
      if (!inServer) {
        results.notInServer++
        results.details.push({
          discordId,
          name: patron.fullName,
          action: 'not_in_server',
        })
        continue
      }

      // Add the role
      const success = await addPatronRole(discordId)
      if (success) {
        results.roleAdded++
        results.details.push({
          discordId,
          name: patron.fullName,
          action: 'role_added',
        })
        console.log('sync-patrons: added Friend of the Pod role', { discordId, name: patron.fullName })
      } else {
        results.failed++
        results.details.push({
          discordId,
          name: patron.fullName,
          action: 'failed',
        })
        console.error('sync-patrons: failed to add role', { discordId, name: patron.fullName })
      }
    }

    console.log('sync-patrons: complete', {
      total: results.total,
      alreadyHadRole: results.alreadyHadRole,
      roleAdded: results.roleAdded,
      notInServer: results.notInServer,
      failed: results.failed,
    })

    return NextResponse.json({ success: true, data: results })
  } catch (error) {
    return handleApiError(error)
  }
}
