// @ts-nocheck
// POST /api/draft - Create a new draft pod
import { query, queryRow, queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { promoTierForCode } from '@/src/services/chaosSealedSelection'
import { getCampaign, drawEventPack } from '@/src/services/promoPacks'
import { getAllCards } from '@/src/utils/cardData'
import { generateShareId } from '@/lib/utils'
import { jsonResponse, parseBody, validateRequired, handleApiError } from '@/lib/utils'
import { getSetConfig } from '@/src/utils/setConfigs/index'
import { getUnavailableSetReason } from '@/src/utils/setAvailability'
import { initializeCardCache } from '@/src/utils/cardCache'
import { generateSealedBox, generateSealedPod, clearBeltCache } from '@/src/utils/boosterPack'
import { defaultRoundTimerEnabled } from '@/src/utils/draftTimerDefaults'
import { broadcastPublicPodsUpdate } from '@/src/lib/socketBroadcast'
import { postPodCreated } from '@/lib/discordLfg'
import { captureLimitedServerEvent } from '@/lib/posthog'
import { LimitedAnalyticsEvents } from '@/src/analytics/limitedEvents'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = requireAuth(request)
    const body = await parseBody(request)
    validateRequired(body, ['setCode'])

    const {
      setCode,
      maxPlayers = 8,
      timerEnabled = false,
      timerSeconds = 30,
      isPublic,
      flowId = null,
      settings = {}
    } = body

    const competitive = body.competitive === true
    const requestedSetCodes = settings.draftMode === 'chaos' && settings.chaosSets
      ? settings.chaosSets
      : [setCode]
    for (const requestedSetCode of requestedSetCodes) {
      if (promoTierForCode(requestedSetCode)) continue // Event Packs are validated separately (entitlement, below)
      const unavailableReason = getUnavailableSetReason(requestedSetCode, session)
      if (unavailableReason) {
        return jsonResponse({ error: unavailableReason }, 403)
      }
    }

    // GC Event Packs (opt-in, Chaos Draft only) ride in chaosSets as their own drafted rounds —
    // each becomes a round the whole pod drafts, just a 2-card one. Validate the creator actually
    // owns any tier they selected; a client can't spoof an unowned tier.
    const eventPackCodes: string[] = requestedSetCodes.filter(promoTierForCode)
    if (eventPackCodes.length > 0) {
      const requestedTiers = [...new Set(eventPackCodes.map(promoTierForCode))]
      const ownedRows = await queryRows(
        'SELECT promo_tier FROM promo_entitlements WHERE user_id = $1 AND campaign = $2',
        [session.id, 'gc2026']
      )
      const owned = new Set(ownedRows.map(r => r.promo_tier))
      if (requestedTiers.some(t => !owned.has(t))) {
        return jsonResponse({ error: 'You have not unlocked that Event Pack' }, 403)
      }
    }

    // Default to public unless explicitly set to false
    const podIsPublic = isPublic !== undefined ? isPublic === true : (settings.isPublic !== undefined ? settings.isPublic === true : true)

    if (competitive && !session.is_admin) {
      const user = await queryRow('SELECT is_patron FROM users WHERE id = $1', [session.id])
      if (!user?.is_patron) {
        return jsonResponse({ error: 'Friends of the Pod required to create Competitive Practice' }, 403)
      }
    }

    const effectiveMaxPlayers = competitive ? 8 : maxPlayers

    // Get set name from config
    // For chaos draft, use "Chaos Draft (LAW x6)" or "Chaos Draft (SOR x2, LAW x4)"
    let setName: string
    if (settings.draftMode === 'chaos' && settings.chaosSets) {
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const year = now.getFullYear()
      // Compress duplicate sets: [LAW, LAW, LAW] → "LAW x3". Event Pack codes get a friendly label.
      const counts: Record<string, number> = {}
      for (const s of settings.chaosSets) {
        const tier = promoTierForCode(s)
        const label = tier === 'silver' ? 'GC Silver' : tier === 'black' ? 'GC Black' : s
        counts[label] = (counts[label] || 0) + 1
      }
      const setList = Object.entries(counts)
        .map(([code, count]) => count > 1 ? `${code} x${count}` : code)
        .join(', ')
      setName = `Chaos Draft (${setList}) ${month}/${day}/${year}`
    } else {
      const setConfig = getSetConfig(setCode)
      setName = setConfig?.setName || setCode
    }

    // Initialize card cache before generating packs
    await initializeCardCache()

    // Generate 24-pack booster box upfront
    // For chaos drafts, generate 8 packs per set (3 sets = 24 packs)
    let boxPacks
    if (settings.draftMode === 'chaos' && settings.chaosSets) {
      clearBeltCache()
      boxPacks = []
      const campaign = getCampaign('gc2026')
      let cardsById = null
      for (const chaosSetCode of settings.chaosSets) {
        const tier = promoTierForCode(chaosSetCode)
        if (tier && campaign) {
          // Event Pack round: one 2-card Event Pack per seat (8), same box shape as a set round
          // (8 packs per chaosSets slot). The draft deals it like any other round — pick 1, pass.
          if (!cardsById) cardsById = new Map(getAllCards().map(c => [c.id, c]))
          for (let i = 0; i < 8; i++) {
            boxPacks.push(drawEventPack(campaign, tier, id => cardsById.get(id) ?? null))
          }
        } else {
          // Generate 8 packs per set for chaos draft. A box is always 24 packs,
          // so cut the 8 from a real box rather than stacking an 8-pack array as
          // if it were one. See .claude/rules/belt-system.md.
          const setPacks = generateSealedPod([], chaosSetCode, 8)
          boxPacks.push(...setPacks)
        }
      }
    } else {
      // Normal draft - generate 24 packs from one set
      boxPacks = generateSealedBox([], setCode, 24)
    }

    // Generate share ID with retry logic
    let shareId = generateShareId(8)
    let attempts = 0
    const maxAttempts = 10
    let result

    while (attempts < maxAttempts) {
      try {
        result = await query(
          `INSERT INTO pods (
            share_id,
            host_id,
            set_code,
            set_name,
            name,
            status,
            max_players,
            current_players,
            timed,
            pick_timeout_seconds,
            timer_enabled,
            timer_seconds,
            settings,
            draft_state,
            state_version,
            box_packs,
            shuffled_packs,
            is_public,
            competitive
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          RETURNING id, share_id, created_at`,
          [
            shareId,
            session.id,
            setCode,
            setName,
            competitive ? `${setName} Competitive Practice` : `${setName} Draft`,
            'waiting',
            effectiveMaxPlayers,
            1, // Host counts as first player
            // Round timer: ON for competitive (the in-draft host controls are
            // hidden there, so it must be on or it could never show), OFF for
            // casual (the host toggles it via the visible timer controls).
            defaultRoundTimerEnabled(competitive),
            60, // Round timer duration default 60s
            timerEnabled,
            timerSeconds,
            JSON.stringify(settings),
            JSON.stringify({ phase: 'lobby' }),
            1,
            JSON.stringify(boxPacks),
            false,
            podIsPublic,
            competitive
          ]
        )
        break
      } catch (error) {
        if (error.message.includes('duplicate key') || error.code === '23505') {
          shareId = generateShareId(8)
          attempts++
          continue
        }
        throw error
      }
    }

    if (attempts >= maxAttempts) {
      throw new Error('Failed to generate unique share ID')
    }

    const pod = result.rows[0]

    // Add host as first player with seat 1
    await query(
      `INSERT INTO pod_players (
        pod_id,
        user_id,
        seat_number,
        pick_status,
        drafted_cards,
        leaders,
        drafted_leaders
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        pod.id,
        session.id,
        1,
        'waiting',
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([])
      ]
    )

    // Broadcast to multiplayer page if pod is public
    if (podIsPublic) {
      broadcastPublicPodsUpdate().catch(err => {
        console.error('Error broadcasting public pods update:', err)
      })
    }

    const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const shareUrl = `${APP_URL}/draft/${shareId}`

    // Post to Discord LFG channel if public
    if (podIsPublic) {
      postPodCreated(
        { id: pod.id, share_id: shareId, set_code: setCode, set_name: setName, name: competitive ? `${setName} Competitive Practice` : `${setName} Draft`, max_players: effectiveMaxPlayers, current_players: 1, pod_type: 'draft', competitive },
        session.username
      ).catch(err => {
        console.error('Error posting draft to Discord:', err)
      })
    }

    captureLimitedServerEvent(
      LimitedAnalyticsEvents.LIMITED_POD_CREATED,
      session.id,
      {
        format: 'draft',
        mode: settings.isSolo === true ? 'solo' : 'group',
        setCode,
        is_public: podIsPublic,
        competitive,
        max_players: effectiveMaxPlayers,
        current_players: 1,
        human_players: 1,
        bot_players: 0,
        podShareId: shareId,
        flowId,
      }
    )

    return jsonResponse({
      id: pod.id,
      shareId: pod.share_id,
      shareUrl,
      createdAt: pod.created_at,
    }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
