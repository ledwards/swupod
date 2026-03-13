// @ts-nocheck
// GET /api/export/personal - Export all personal data for the authenticated user
import { queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

// Format card name with subtitle: "Title, Subtitle" or just "Title"
function formatCardName(name: string, subtitle?: string | null): string {
  return subtitle ? `${name}, ${subtitle}` : name
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = requireAuth(request)

    // Get user's discord username
    const userRow = await queryRows(
      `SELECT username FROM users WHERE id = $1`,
      [session.id]
    )
    const discordHandle = userRow[0]?.username || session.username || 'unknown'

    // 1. Get all pods the user participated in (draft + sealed)
    const pods = await queryRows(
      `SELECT
        p.id as pod_id,
        p.share_id,
        p.pod_type,
        p.set_code,
        p.set_name,
        p.name as pod_name,
        p.status,
        p.max_players,
        p.current_players,
        p.started_at,
        p.completed_at,
        p.created_at,
        pp.seat_number,
        pp.player_number
      FROM pods p
      JOIN pod_players pp ON p.id = pp.pod_id
      WHERE pp.user_id = $1
        AND (pp.is_bot = false OR pp.is_bot IS NULL)
      ORDER BY p.created_at DESC`,
      [session.id]
    )

    // 2. Get opponents for each pod (discord handles + leaders)
    const podIds = pods.map(p => p.pod_id)
    let opponents: any[] = []
    if (podIds.length > 0) {
      opponents = await queryRows(
        `SELECT
          pp.pod_id,
          pp.seat_number,
          pp.player_number,
          pp.is_bot,
          pp.drafted_leaders,
          u.username as discord_handle
        FROM pod_players pp
        LEFT JOIN users u ON pp.user_id = u.id
        WHERE pp.pod_id = ANY($1)
          AND pp.user_id != $2
        ORDER BY pp.pod_id, pp.seat_number`,
        [podIds, session.id]
      )
    }

    // Group opponents by pod_id
    const opponentsByPod: Record<string, any[]> = {}
    for (const opp of opponents) {
      const podId = opp.pod_id
      if (!opponentsByPod[podId]) opponentsByPod[podId] = []
      // Extract leader names from drafted_leaders JSONB
      const leaders = (opp.drafted_leaders || []).map((l: any) =>
        typeof l === 'string' ? l : l?.name || l?.cardName || 'Unknown'
      )
      opponentsByPod[podId].push({
        discordHandle: opp.is_bot ? `Bot (seat ${opp.seat_number})` : (opp.discord_handle || 'Unknown'),
        seatNumber: opp.seat_number,
        isBot: opp.is_bot || false,
        leaders,
      })
    }

    // 3. Get all card pools for the user
    const pools = await queryRows(
      `SELECT
        id as pool_id,
        share_id,
        pod_id,
        set_code,
        set_name,
        name as pool_name,
        pool_type,
        cards,
        packs,
        deck_builder_state,
        is_public,
        created_at,
        updated_at
      FROM card_pools
      WHERE user_id = $1
        AND pod_id IS NOT NULL
      ORDER BY created_at DESC`,
      [session.id]
    )

    // 4. Get all built decks
    const decks = await queryRows(
      `SELECT
        id as deck_id,
        card_pool_id as pool_id,
        set_code,
        pool_type,
        leader,
        base,
        deck,
        sideboard,
        built_at
      FROM built_decks
      WHERE user_id = $1
      ORDER BY built_at DESC`,
      [session.id]
    )

    // 5. Get all draft picks (ordered by pick sequence)
    const picks = await queryRows(
      `SELECT
        draft_pod_id as pod_id,
        card_id,
        card_name,
        set_code,
        rarity,
        card_type,
        variant_type,
        is_leader,
        pack_number,
        pick_in_pack,
        pick_number,
        leader_round,
        picked_at
      FROM draft_picks
      WHERE user_id = $1
      ORDER BY draft_pod_id, pick_number`,
      [session.id]
    )

    // Group picks by pod_id
    const picksByPod: Record<string, any[]> = {}
    for (const pick of picks) {
      const podId = pick.pod_id
      if (!picksByPod[podId]) picksByPod[podId] = []
      picksByPod[podId].push({
        cardId: pick.card_id,
        cardName: pick.card_name,
        setCode: pick.set_code,
        rarity: pick.rarity,
        cardType: pick.card_type,
        variantType: pick.variant_type,
        isLeader: pick.is_leader,
        packNumber: pick.pack_number,
        pickInPack: pick.pick_in_pack,
        pickNumber: pick.pick_number,
        pickedAt: pick.picked_at,
      })
    }

    // Assemble pods with their linked data
    const assembledPods = pods.map(pod => ({
      podId: pod.pod_id,
      shareId: pod.share_id,
      podType: pod.pod_type,
      setCode: pod.set_code,
      setName: pod.set_name,
      podName: pod.pod_name,
      status: pod.status,
      maxPlayers: pod.max_players,
      currentPlayers: pod.current_players,
      yourSeatNumber: pod.seat_number,
      yourPlayerNumber: pod.player_number,
      startedAt: pod.started_at,
      completedAt: pod.completed_at,
      createdAt: pod.created_at,
      opponents: opponentsByPod[pod.pod_id] || [],
      draftPicks: picksByPod[pod.pod_id] || [],
    }))

    // Strip deck_builder_state internals - just keep leader/base/deck composition
    const assembledPools = pools.map(pool => {
      const dbs = pool.deck_builder_state
      const leaderName = dbs?.leaderCard?.name || dbs?.leaderCard?.cardName || null
      const baseName = dbs?.baseCard?.name || dbs?.baseCard?.cardName || null

      // pool.cards may be a JSON string or already parsed array
      const rawCards = pool.cards
      const cards = Array.isArray(rawCards)
        ? rawCards
        : (typeof rawCards === 'string' ? JSON.parse(rawCards) : [])

      return {
        poolId: pool.pool_id,
        shareId: pool.share_id,
        podId: pool.pod_id,
        setCode: pool.set_code,
        setName: pool.set_name,
        poolName: pool.pool_name,
        poolType: pool.pool_type,
        cardCount: cards.length,
        cards: cards.map((c: any) => ({
          id: c.id,
          name: formatCardName(c.name, c.subtitle),
          setCode: c.set,
          rarity: c.rarity,
          type: c.type,
          aspects: c.aspects,
          variantType: c.variantType,
          cost: c.cost,
          power: c.power,
          hp: c.hp,
        })),
        packCount: Array.isArray(pool.packs) ? pool.packs.length : 0,
        selectedLeader: leaderName,
        selectedBase: baseName,
        isPublic: pool.is_public,
        createdAt: pool.created_at,
        updatedAt: pool.updated_at,
      }
    })

    const assembledDecks = decks.map(deck => ({
      deckId: deck.deck_id,
      poolId: deck.pool_id,
      setCode: deck.set_code,
      poolType: deck.pool_type,
      leader: deck.leader ? { name: formatCardName(deck.leader.name || deck.leader.cardName, deck.leader.subtitle), id: deck.leader.id, aspects: deck.leader.aspects } : null,
      base: deck.base ? { name: formatCardName(deck.base.name || deck.base.cardName, deck.base.subtitle), id: deck.base.id, aspects: deck.base.aspects } : null,
      deckCards: (deck.deck || []).map((c: any) => ({
        id: c.id,
        name: formatCardName(c.name, c.subtitle),
        setCode: c.set,
        rarity: c.rarity,
        type: c.type,
        aspects: c.aspects,
        variantType: c.variantType,
        cost: c.cost,
      })),
      sideboardCards: (deck.sideboard || []).map((c: any) => ({
        id: c.id,
        name: formatCardName(c.name, c.subtitle),
        setCode: c.set,
        rarity: c.rarity,
        type: c.type,
        aspects: c.aspects,
        variantType: c.variantType,
        cost: c.cost,
      })),
      deckSize: (deck.deck || []).length,
      sideboardSize: (deck.sideboard || []).length,
      builtAt: deck.built_at,
    }))

    const exportData = {
      _meta: {
        exportedAt: new Date().toISOString(),
        discordHandle,
        version: '1.0',
        description: 'Personal data export from Protect the Pod (swupod). Contains your pods, pools, decks, and draft picks. Pod/pool/deck IDs link related records together.',
      },
      summary: {
        totalPods: assembledPods.length,
        totalPools: assembledPools.length,
        totalDecks: assembledDecks.length,
        totalDraftPicks: picks.length,
        podsByType: {
          draft: assembledPods.filter(p => p.podType === 'draft').length,
          sealed: assembledPods.filter(p => p.podType === 'sealed').length,
        },
        poolsByType: assembledPools.reduce((acc: Record<string, number>, p) => {
          acc[p.poolType] = (acc[p.poolType] || 0) + 1
          return acc
        }, {}),
      },
      pods: assembledPods,
      pools: assembledPools,
      decks: assembledDecks,
    }

    const json = JSON.stringify(exportData, null, 2)

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="swupod-export-${discordHandle}-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
