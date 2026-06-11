// @ts-nocheck
// GET/POST /api/formats/rotisserie/:shareId - Get/Update rotisserie draft
import { query, queryRow } from '@/lib/db'
import { requireBetaAccess } from '@/lib/auth'
import { jsonResponse, parseBody, handleApiError, errorResponse } from '@/lib/utils'
import { getSetConfig } from '@/src/utils/setConfigs/index'
import { initializeCardCache, getCachedCards } from '@/src/utils/cardCache'
import { broadcastRotisserieState } from '@/src/lib/socketBroadcast'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

// Sets 3+ include S rarity cards
const SETS_WITH_S_CARDS = new Set(['TWI', 'JTL', 'LOF', 'SEC', 'LAW'])

// Generate card pool from selected sets - called when draft starts
function generateCardPool(setCodes: string[]) {
  if (!setCodes || setCodes.length === 0) {
    return { cardPool: [], leaders: [], bases: [] }
  }

  const allCards = setCodes.flatMap(setCode => {
    const cards = getCachedCards(setCode)
    const includeS = SETS_WITH_S_CARDS.has(setCode)

    return cards.filter(card => {
      if (card.isToken || card.type === 'Token') return false
      if (card.variantType && card.variantType !== 'Normal') return false
      if (card.rarity === 'Special' || card.rarity === 'S') return includeS
      return true
    })
  })

  const leaders = allCards.filter(c => c.type === 'Leader' || c.isLeader)
  const allBases = allCards.filter(c => c.type === 'Base' || c.isBase)
  const rareBases = allBases.filter(b => b.rarity !== 'Common')
  const draftableCards = allCards.filter(c =>
    c.type !== 'Leader' && !c.isLeader &&
    c.type !== 'Base' && !c.isBase
  )

  // Add instance IDs and ensure type flags
  let counter = 0
  const cardPool = draftableCards.map(c => ({ ...c, instanceId: `${c.id}_${counter++}` }))
  const leadersWithIds = leaders.map(c => ({ ...c, instanceId: `${c.id}_${counter++}`, isLeader: true }))
  const basesWithIds = rareBases.map(c => ({ ...c, instanceId: `${c.id}_${counter++}`, isBase: true }))

  return { cardPool, leaders: leadersWithIds, bases: basesWithIds }
}

// GET - Get rotisserie draft state
export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params

    const pool = await queryRow(
      'SELECT * FROM card_pools WHERE share_id = $1 AND pool_type = $2',
      [shareId, 'rotisserie']
    )

    if (!pool) {
      return errorResponse('Rotisserie draft not found', 404)
    }

    const data = typeof pool.cards === 'string' ? JSON.parse(pool.cards) : pool.cards

    return jsonResponse({
      shareId: pool.share_id,
      createdAt: pool.created_at,
      ...data
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST - Actions: join, start, update-settings, update-sets, add-bot, cancel, pick, bot-pick
export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = await requireBetaAccess(request)
    const body = await parseBody(request)
    const { action } = body

    const pool = await queryRow(
      'SELECT * FROM card_pools WHERE share_id = $1 AND pool_type = $2',
      [shareId, 'rotisserie']
    )

    if (!pool) {
      return errorResponse('Rotisserie draft not found', 404)
    }

    const data = typeof pool.cards === 'string' ? JSON.parse(pool.cards) : pool.cards

    switch (action) {
      case 'join': {
        if (data.status !== 'waiting') {
          return errorResponse('Draft has already started', 400)
        }
        if (data.players.length >= data.maxPlayers) {
          return errorResponse('Draft is full', 400)
        }
        if (data.players.some(p => p.id === session.id)) {
          return jsonResponse({ message: 'Already joined', ...data })
        }

        data.players.push({
          id: session.id,
          name: session.username || `Player ${data.players.length + 1}`,
          seat: data.players.length + 1,
          avatarUrl: session.avatar_url || null
        })

        await query(
          'UPDATE card_pools SET cards = $1 WHERE share_id = $2',
          [JSON.stringify(data), shareId]
        )

        await broadcastRotisserieState(shareId)
        return jsonResponse({ message: 'Joined draft', ...data })
      }

      case 'start': {
        if (data.players[0]?.id !== session.id) {
          return errorResponse('Only the host can start the draft', 403)
        }
        if (data.status !== 'waiting') {
          return errorResponse('Draft has already started', 400)
        }
        if (data.players.length < 2) {
          return errorResponse('Need at least 2 players', 400)
        }
        if (!data.setCodes || data.setCodes.length === 0) {
          return errorResponse('Select at least one set', 400)
        }

        // Generate card pool now
        await initializeCardCache()
        const { cardPool, leaders, bases } = generateCardPool(data.setCodes)

        // Shuffle player order
        const shuffledPlayers = [...data.players].sort(() => Math.random() - 0.5)
        shuffledPlayers.forEach((p, i) => p.seat = i + 1)

        data.players = shuffledPlayers
        data.cardPool = cardPool
        data.leaders = leaders
        data.bases = bases
        data.pickedCards = []
        data.currentPickerIndex = 0
        data.pickDirection = 1
        data.pickNumber = 1

        // Calculate total picks based on draft mode
        const totalCards = cardPool.length + leaders.length + bases.length
        if (data.draftMode === 'exhausted') {
          // In exhausted mode, draft until all cards are picked
          // Each player gets equal picks (round down to ensure fairness)
          data.picksPerPlayer = Math.floor(totalCards / data.players.length)
          data.totalPicks = data.picksPerPlayer * data.players.length
        } else {
          // Fixed mode uses configured picksPerPlayer
          data.totalPicks = data.picksPerPlayer * data.players.length
        }
        data.status = 'active'
        data.lastPickTimestamp = Date.now()

        await query(
          'UPDATE card_pools SET cards = $1, set_code = $2 WHERE share_id = $3',
          [JSON.stringify(data), data.setCodes.join(','), shareId]
        )

        await broadcastRotisserieState(shareId)
        return jsonResponse({ message: 'Draft started', ...data })
      }

      case 'add-bot': {
        if (data.players[0]?.id !== session.id) {
          return errorResponse('Only the host can add bots', 403)
        }
        if (data.status !== 'waiting') {
          return errorResponse('Cannot add bots after draft has started', 400)
        }
        if (data.players.length >= data.maxPlayers) {
          return errorResponse('Draft is full', 400)
        }

        const botNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta']
        const existingBotCount = data.players.filter(p => p.id.startsWith('bot_')).length
        const botName = `Bot ${botNames[existingBotCount] || existingBotCount + 1}`
        const botId = `bot_${Date.now()}_${existingBotCount}`

        data.players.push({
          id: botId,
          name: botName,
          seat: data.players.length + 1
        })

        await query(
          'UPDATE card_pools SET cards = $1 WHERE share_id = $2',
          [JSON.stringify(data), shareId]
        )

        await broadcastRotisserieState(shareId)
        return jsonResponse({ message: 'Bot added', ...data })
      }

      case 'update-settings': {
        if (data.players[0]?.id !== session.id) {
          return errorResponse('Only the host can update settings', 403)
        }
        if (data.status !== 'waiting') {
          return errorResponse('Cannot change settings after draft has started', 400)
        }

        const { maxPlayers, timerEnabled, pickTimerSeconds, picksPerPlayer, draftMode } = body

        if (draftMode !== undefined && (draftMode === 'fixed' || draftMode === 'exhausted')) {
          data.draftMode = draftMode
        }
        if (maxPlayers !== undefined) {
          const clamped = Math.max(2, Math.min(16, Number(maxPlayers)))
          if (clamped >= data.players.length) {
            data.maxPlayers = clamped
          }
        }
        if (timerEnabled !== undefined) {
          data.timerEnabled = Boolean(timerEnabled)
        }
        if (pickTimerSeconds !== undefined) {
          data.pickTimerSeconds = Math.max(10, Math.min(600, Number(pickTimerSeconds)))
        }
        if (picksPerPlayer !== undefined) {
          data.picksPerPlayer = Math.max(1, Math.min(500, Number(picksPerPlayer)))
        }

        await query(
          'UPDATE card_pools SET cards = $1 WHERE share_id = $2',
          [JSON.stringify(data), shareId]
        )

        await broadcastRotisserieState(shareId)
        return jsonResponse({ message: 'Settings updated', ...data })
      }

      case 'update-sets': {
        if (data.players[0]?.id !== session.id) {
          return errorResponse('Only the host can change sets', 403)
        }
        if (data.status !== 'waiting') {
          return errorResponse('Cannot change sets after draft has started', 400)
        }

        const { setCodes } = body
        if (!Array.isArray(setCodes)) {
          return errorResponse('setCodes must be an array', 400)
        }

        // Validate set codes
        for (const setCode of setCodes) {
          if (!getSetConfig(setCode)) {
            return errorResponse(`Invalid set code: ${setCode}`, 400)
          }
        }

        data.setCodes = setCodes

        await query(
          'UPDATE card_pools SET cards = $1 WHERE share_id = $2',
          [JSON.stringify(data), shareId]
        )

        await broadcastRotisserieState(shareId)
        return jsonResponse({ message: 'Sets updated', ...data })
      }

      case 'cancel': {
        if (data.players[0]?.id !== session.id) {
          return errorResponse('Only the host can cancel the draft', 403)
        }

        await query('DELETE FROM card_pools WHERE share_id = $1', [shareId])

        // Emit deleted event to all clients
        const io = global.io
        if (io) {
          io.to(`rotisserie:${shareId}`).emit('deleted')
        }

        return jsonResponse({ message: 'Draft cancelled' })
      }

      case 'bot-pick': {
        if (data.status !== 'active') {
          return errorResponse('Draft is not active', 400)
        }

        const currentBot = data.players[data.currentPickerIndex]
        if (!currentBot?.id.startsWith('bot_')) {
          return errorResponse('Current picker is not a bot', 400)
        }

        const { RotisserieBehavior } = await import('@/src/bots/behaviors/RotisserieBehavior')
        const botBehavior = new RotisserieBehavior()

        const pickedIds = new Set(data.pickedCards.map(p => p.cardInstanceId))
        const availableCards = [
          ...data.cardPool.filter(c => !pickedIds.has(c.instanceId)),
          ...data.leaders.filter(c => !pickedIds.has(c.instanceId)),
          ...data.bases.filter(c => !pickedIds.has(c.instanceId))
        ]

        const botPicks = data.pickedCards
          .filter(p => p.playerId === currentBot.id)
          .map(p => {
            return data.cardPool.find(c => c.instanceId === p.cardInstanceId) ||
              data.leaders.find(c => c.instanceId === p.cardInstanceId) ||
              data.bases.find(c => c.instanceId === p.cardInstanceId)
          })
          .filter(Boolean)

        const selectedCard = botBehavior.selectCard(availableCards, {
          myPicks: botPicks,
          allPicks: data.pickedCards,
          myPlayerId: currentBot.id,
          setCodes: data.setCodes
        })

        if (!selectedCard) {
          return errorResponse('Bot could not find a valid card to pick', 500)
        }

        data.pickedCards.push({
          cardInstanceId: selectedCard.instanceId,
          playerId: currentBot.id,
          pickNumber: data.pickNumber
        })

        data.lastPickTimestamp = Date.now()
        data.pickNumber++

        // Snake draft advancement
        const nextIndex = data.currentPickerIndex + data.pickDirection
        if (nextIndex >= data.players.length) {
          data.pickDirection = -1
        } else if (nextIndex < 0) {
          data.pickDirection = 1
        } else {
          data.currentPickerIndex = nextIndex
        }

        if (data.pickNumber > data.totalPicks) {
          data.status = 'completed'
        }

        await query(
          'UPDATE card_pools SET cards = $1 WHERE share_id = $2',
          [JSON.stringify(data), shareId]
        )

        await broadcastRotisserieState(shareId)
        return jsonResponse({ message: 'Bot pick recorded', ...data })
      }

      case 'pick': {
        if (data.status !== 'active') {
          return errorResponse('Draft is not active', 400)
        }

        const { cardInstanceId } = body
        if (!cardInstanceId) {
          return errorResponse('cardInstanceId is required', 400)
        }

        const currentPicker = data.players[data.currentPickerIndex]
        if (currentPicker.id !== session.id) {
          return errorResponse('Not your turn', 403)
        }

        const isPicked = data.pickedCards.some(p => p.cardInstanceId === cardInstanceId)
        if (isPicked) {
          return errorResponse('Card already picked', 400)
        }

        const cardExists = data.cardPool.some(c => c.instanceId === cardInstanceId) ||
          data.leaders.some(c => c.instanceId === cardInstanceId) ||
          data.bases.some(c => c.instanceId === cardInstanceId)
        if (!cardExists) {
          return errorResponse('Card not found in pool', 400)
        }

        data.pickedCards.push({
          cardInstanceId,
          playerId: session.id,
          pickNumber: data.pickNumber
        })

        data.lastPickTimestamp = Date.now()
        data.pickNumber++

        // Snake draft advancement
        const nextIndex = data.currentPickerIndex + data.pickDirection
        if (nextIndex >= data.players.length) {
          data.pickDirection = -1
        } else if (nextIndex < 0) {
          data.pickDirection = 1
        } else {
          data.currentPickerIndex = nextIndex
        }

        if (data.pickNumber > data.totalPicks) {
          data.status = 'completed'
        }

        await query(
          'UPDATE card_pools SET cards = $1 WHERE share_id = $2',
          [JSON.stringify(data), shareId]
        )

        await broadcastRotisserieState(shareId)
        return jsonResponse({ message: 'Pick recorded', ...data })
      }

      default:
        return errorResponse('Invalid action', 400)
    }
  } catch (error) {
    return handleApiError(error)
  }
}
