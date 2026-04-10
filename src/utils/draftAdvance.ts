// @ts-nocheck - Gradual migration
/**
 * Draft Advance Logic
 *
 * Handles advancing draft state after picks are made.
 * Extracted to avoid circular imports between pick route and bot logic.
 */

import { query, queryRow, queryRows } from '@/lib/db'
import { getPassDirection, getLeaderPassDirection, getNextSeat } from './draftLogic'
import { buildBotDecks } from './botDeckBuilder'
import type { RawCard } from './cardData'

interface DraftState {
  phase?: string
  leaderRound?: number
  totalPacks?: number
  packNumber?: number
  pickInPack?: number
  setCode?: string
  lastPlayerStartedAt?: string
}

interface DraftPod {
  id: string
  share_id: string
  status: string
  draft_state: string | DraftState
  state_version: number
  settings?: string | Record<string, unknown>
  all_packs?: string | unknown[]
}

interface DraftPlayer {
  id: string
  pod_id: string
  user_id: string | null
  seat_number: number
  pick_status: string
  is_bot: boolean
  leaders: string | RawCard[]
  drafted_leaders: string | RawCard[]
  drafted_cards: string | RawCard[]
  current_pack: string | RawCard[]
  selected_card_id: string | null
}

interface CardWithMetadata extends RawCard {
  instanceId?: string
  pickNumber?: number
  leaderRound?: number
  packNumber?: number
  pickInPack?: number
}

function getTotalPacks(draftState: DraftState, pod: DraftPod): number {
  if (typeof draftState.totalPacks === 'number' && draftState.totalPacks > 0) {
    return draftState.totalPacks
  }

  const settings = typeof pod?.settings === 'string'
    ? JSON.parse(pod.settings)
    : pod?.settings || {}
  const chaosSets = settings?.draftMode === 'chaos' && Array.isArray(settings?.chaosSets)
    ? settings.chaosSets
    : null

  return chaosSets?.length || 3
}

export function parseCurrentPack(currentPack: string | RawCard[] | null | undefined): RawCard[] {
  if (Array.isArray(currentPack)) {
    return currentPack
  }
  if (typeof currentPack === 'string') {
    try {
      const parsed = JSON.parse(currentPack)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function isPackPickComplete(player: Pick<DraftPlayer, 'pick_status' | 'current_pack'>): boolean {
  if (player.pick_status === 'picked') {
    return true
  }
  if (player.pick_status !== 'picking') {
    return false
  }
  return parseCurrentPack(player.current_pack).length === 0
}

/**
 * Process all staged picks when all players have selected
 * This is the new "staged pick" system where:
 * 1. Players select cards (stored in selected_card_id)
 * 2. When all have selected, this function processes all picks at once
 * 3. Then advances the draft
 */
export async function processAllStagedPicks(
  podId: string,
  draftState: DraftState,
  pod: Record<string, unknown>
): Promise<boolean> {
  // Use SELECT FOR UPDATE to lock the rows and prevent race conditions
  // This ensures only one request can process picks at a time
  const players = await queryRows(
    'SELECT * FROM pod_players WHERE pod_id = $1 ORDER BY seat_number FOR UPDATE',
    [podId]
  )

  // Check if there are actually picks to process (must re-check after acquiring lock)
  const hasPicksToProcess = players.some(p => p.selected_card_id && p.pick_status === 'selected')
  if (!hasPicksToProcess) {
    // No picks to process - already processed or nothing selected
    return false
  }

  // Double-check ALL players are in 'selected' status before processing
  // This prevents partial processing if some picks already went through
  const allSelected = players.every(p => p.pick_status === 'selected' && p.selected_card_id)
  if (!allSelected) {
    // Not all players have selected - don't process yet
    return false
  }

  if (draftState.phase === 'leader_draft') {
    // Process leader picks
    for (const player of players) {
      const cardId = player.selected_card_id
      if (!cardId) continue

      const leaders: CardWithMetadata[] = typeof player.leaders === 'string'
        ? JSON.parse(player.leaders)
        : player.leaders || []

      const draftedLeaders: CardWithMetadata[] = typeof player.drafted_leaders === 'string'
        ? JSON.parse(player.drafted_leaders)
        : player.drafted_leaders || []

      // Find and pick the leader
      const leaderIndex = leaders.findIndex(l =>
        (l.instanceId && l.instanceId === cardId) || (!l.instanceId && l.id === cardId)
      )

      if (leaderIndex >= 0) {
        const pickedLeader = leaders[leaderIndex]
        const remainingLeaders = leaders.filter((_, i) => i !== leaderIndex)

        // Add pick metadata
        const leaderRound = draftState.leaderRound || 1
        pickedLeader.pickNumber = draftedLeaders.length + 1
        pickedLeader.leaderRound = leaderRound

        draftedLeaders.push(pickedLeader)

        await query(
          `UPDATE pod_players
           SET drafted_leaders = $1,
               leaders = $2,
               selected_card_id = NULL,
               pick_status = 'picked',
               last_pick_at = NOW()
           WHERE id = $3`,
          [JSON.stringify(draftedLeaders), JSON.stringify(remainingLeaders), player.id]
        )

        // Record in draft_picks for analytics
        try {
          await query(
            `INSERT INTO draft_picks (
              pod_id, user_id, card_id, card_name, set_code, rarity,
              card_type, variant_type, is_leader, pack_number, pick_in_pack,
              pick_number, leader_round
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 0, $9, $10, $11)`,
            [
              podId, player.user_id,
              pickedLeader.id, pickedLeader.name, pickedLeader.set, pickedLeader.rarity,
              pickedLeader.type, pickedLeader.variantType || 'Normal',
              leaderRound, pickedLeader.pickNumber, leaderRound
            ]
          )
        } catch (err) {
          console.error('[DRAFT_PICKS] Error recording leader pick:', err)
        }
      }
    }

    // Advance leader draft
    await advanceLeaderDraftAfterPicks(podId, draftState, pod as unknown as DraftPod, players)

  } else if (draftState.phase === 'pack_draft') {
    // Process pack picks
    for (const player of players) {
      const cardId = player.selected_card_id
      if (!cardId) continue

      const currentPack: CardWithMetadata[] = parseCurrentPack(player.current_pack)

      const draftedCards: CardWithMetadata[] = typeof player.drafted_cards === 'string'
        ? JSON.parse(player.drafted_cards)
        : player.drafted_cards || []

      // Find and pick the card
      const cardIndex = currentPack.findIndex(c =>
        (c.instanceId && c.instanceId === cardId) || (!c.instanceId && c.id === cardId)
      )

      if (cardIndex >= 0) {
        const pickedCard = currentPack[cardIndex]
        const remainingPack = currentPack.filter((_, i) => i !== cardIndex)

        // Add pick metadata
        const packNumber = draftState.packNumber || 1
        const pickInPack = draftState.pickInPack || 1
        pickedCard.pickNumber = draftedCards.length + 1
        pickedCard.packNumber = packNumber
        pickedCard.pickInPack = pickInPack

        draftedCards.push(pickedCard)

        await query(
          `UPDATE pod_players
           SET drafted_cards = $1,
               current_pack = $2,
               selected_card_id = NULL,
               pick_status = 'picked',
               last_pick_at = NOW()
           WHERE id = $3`,
          [JSON.stringify(draftedCards), JSON.stringify(remainingPack), player.id]
        )

        // Record in draft_picks for analytics
        try {
          await query(
            `INSERT INTO draft_picks (
              pod_id, user_id, card_id, card_name, set_code, rarity,
              card_type, variant_type, is_leader, pack_number, pick_in_pack,
              pick_number, leader_round
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10, $11, NULL)`,
            [
              podId, player.user_id,
              pickedCard.id, pickedCard.name, pickedCard.set, pickedCard.rarity,
              pickedCard.type, pickedCard.variantType || 'Normal',
              packNumber, pickInPack, pickedCard.pickNumber
            ]
          )
        } catch (err) {
          console.error('[DRAFT_PICKS] Error recording card pick:', err)
        }
      }
    }

    // Advance pack draft
    await advancePackDraftAfterPicks(podId, draftState, pod as unknown as DraftPod)
  }

  return true
}

/**
 * Advance leader draft after all picks are processed
 */
async function advanceLeaderDraftAfterPicks(
  podId: string,
  draftState: DraftState,
  pod: DraftPod,
  players: DraftPlayer[]
): Promise<void> {
  const currentRound = draftState.leaderRound
  const totalPacks = getTotalPacks(draftState, pod)

  if (currentRound < totalPacks) {
    const direction = getLeaderPassDirection(currentRound)
    const updatedPlayers = await queryRows(
      'SELECT * FROM pod_players WHERE pod_id = $1 ORDER BY seat_number',
      [podId]
    )
    await passLeaders(updatedPlayers, direction)

    draftState.leaderRound = currentRound + 1
    delete draftState.lastPlayerStartedAt // Clear last player timer for new round
    await query(
      `UPDATE pods
       SET draft_state = $1,
           state_version = state_version + 1,
           pick_started_at = NOW(),
           paused_duration_seconds = 0
       WHERE id = $2`,
      [JSON.stringify(draftState), podId]
    )

    await query(
      `UPDATE pod_players SET pick_status = 'picking' WHERE pod_id = $1`,
      [podId]
    )
  } else {
    // Transition to pack draft
    draftState.phase = 'pack_draft'
    draftState.packNumber = 1
    draftState.pickInPack = 1
    delete draftState.lastPlayerStartedAt // Clear last player timer for new phase

    // Fetch all_packs only when transitioning to pack draft
    const podWithPacks = await queryRow(
      'SELECT all_packs FROM pods WHERE id = $1',
      [podId]
    )
    const allPacks: unknown[][] = typeof podWithPacks?.all_packs === 'string'
      ? JSON.parse(podWithPacks.all_packs)
      : podWithPacks?.all_packs as unknown[][]

    const updatedPlayers = await queryRows(
      'SELECT * FROM pod_players WHERE pod_id = $1 ORDER BY seat_number',
      [podId]
    )

    for (let i = 0; i < updatedPlayers.length; i++) {
      const player = updatedPlayers[i]
      const pack = allPacks[i][0] as { cards?: RawCard[] } | RawCard[]
      const packCards = (pack as { cards?: RawCard[] }).cards || pack // Extract cards array from pack object

      await query(
        `UPDATE pod_players
         SET current_pack = $1, pick_status = 'picking'
         WHERE id = $2`,
        [JSON.stringify(packCards), player.id]
      )
    }

    await query(
      `UPDATE pods
       SET draft_state = $1,
           state_version = state_version + 1,
           pick_started_at = NOW(),
           paused_duration_seconds = 0
       WHERE id = $2`,
      [JSON.stringify(draftState), podId]
    )
  }
}

/**
 * Advance pack draft after all picks are processed
 */
async function advancePackDraftAfterPicks(
  podId: string,
  draftState: DraftState,
  pod: DraftPod
): Promise<void> {
  const players = await queryRows(
    'SELECT * FROM pod_players WHERE pod_id = $1 ORDER BY seat_number',
    [podId]
  )

  const packNumber = draftState.packNumber || 1
  const pickInPack = draftState.pickInPack || 1
  const totalPacks = getTotalPacks(draftState, pod)

  // Check if current pack is exhausted
  const firstPlayer = players[0]
  const remainingPack: RawCard[] = parseCurrentPack(firstPlayer.current_pack)

  if (remainingPack.length === 0) {
    if (packNumber >= totalPacks) {
      // Draft complete
      await query(
        `UPDATE pods
         SET status = 'complete',
             draft_state = $1,
             completed_at = NOW(),
             state_version = state_version + 1
         WHERE id = $2`,
        [JSON.stringify({ ...draftState, phase: 'complete' }), podId]
      )

      // Build decks for bot players (fire-and-forget)
      const podForBots = await queryRow('SELECT * FROM pods WHERE id = $1', [podId])
      const botSettings = typeof podForBots?.settings === 'string' ? JSON.parse(podForBots.settings) : podForBots?.settings || {}
      buildBotDecks(podId, podForBots?.set_code || draftState.setCode || '', botSettings).catch(err =>
        console.error('[BOT_DECK] Error building bot decks:', err)
      )

      // Set deck build deadline for competitive pods
      if (podForBots?.competitive) {
        const deckLockAt = new Date(Date.now() + 20 * 60 * 1000).toISOString()
        await query(
          `UPDATE pods SET deck_lock_at = $2 WHERE id = $1`,
          [podId, deckLockAt]
        )
      }

      return
    }

    // Move to next pack
    draftState.packNumber = packNumber + 1
    draftState.pickInPack = 1
    delete draftState.lastPlayerStartedAt // Clear last player timer for new pack

    // Fetch all_packs only when we need to start a new pack
    // (not loaded in most queries to save memory)
    const podWithPacks = await queryRow(
      'SELECT all_packs FROM pods WHERE id = $1',
      [podId]
    )
    const allPacks: unknown[][] = typeof podWithPacks?.all_packs === 'string'
      ? JSON.parse(podWithPacks.all_packs)
      : podWithPacks?.all_packs as unknown[][]

    for (let i = 0; i < players.length; i++) {
      const player = players[i]
      const pack = allPacks[i][packNumber] as { cards?: RawCard[] } | RawCard[]
      const packCards = (pack as { cards?: RawCard[] }).cards || pack // Extract cards array from pack object

      await query(
        `UPDATE pod_players
         SET current_pack = $1, pick_status = 'picking'
         WHERE id = $2`,
        [JSON.stringify(packCards), player.id]
      )
    }

    await query(
      `UPDATE pods
       SET draft_state = $1,
           state_version = state_version + 1,
           pick_started_at = NOW(),
           paused_duration_seconds = 0
       WHERE id = $2`,
      [JSON.stringify(draftState), podId]
    )

  } else {
    // Pass packs and continue
    const direction = getPassDirection(packNumber)
    await passPacks(players, direction)

    draftState.pickInPack = pickInPack + 1
    delete draftState.lastPlayerStartedAt // Clear last player timer for new pick

    await query(
      `UPDATE pods
       SET draft_state = $1,
           state_version = state_version + 1,
           pick_started_at = NOW(),
           paused_duration_seconds = 0
       WHERE id = $2`,
      [JSON.stringify(draftState), podId]
    )

    await query(
      `UPDATE pod_players SET pick_status = 'picking' WHERE pod_id = $1`,
      [podId]
    )
  }
}

/**
 * Check if all players picked and advance leader draft
 */
export async function checkAndAdvanceLeaderDraft(
  podId: string,
  draftState: DraftState,
  pod: DraftPod
): Promise<boolean> {
  const players = await queryRows(
    'SELECT * FROM pod_players WHERE pod_id = $1 ORDER BY seat_number',
    [podId]
  )

  const allPicked = players.every(isPackPickComplete)
  if (!allPicked) {
    // Just increment state version
    await query(
      'UPDATE pods SET state_version = state_version + 1 WHERE id = $1',
      [podId]
    )
    return false
  }

  // All players have picked - advance to next round
  const currentRound = draftState.leaderRound
  const totalPacks = getTotalPacks(draftState, pod)

  if (currentRound < totalPacks) {
    const direction = getLeaderPassDirection(currentRound) // 'right'
    await passLeaders(players, direction)

    draftState.leaderRound = currentRound + 1
    delete draftState.lastPlayerStartedAt // Clear last player timer for new round
    await query(
      `UPDATE pods
       SET draft_state = $1,
           state_version = state_version + 1,
           pick_started_at = NOW(),
           paused_duration_seconds = 0
       WHERE id = $2`,
      [JSON.stringify(draftState), podId]
    )

    await query(
      `UPDATE pod_players
       SET pick_status = 'picking'
       WHERE pod_id = $1`,
      [podId]
    )
  } else {
    // Round 3 complete - transition to pack draft phase
    draftState.phase = 'pack_draft'
    draftState.packNumber = 1
    draftState.pickInPack = 1
    delete draftState.lastPlayerStartedAt // Clear last player timer for new phase

    // Fetch all_packs only when transitioning to pack draft
    const podWithPacks = await queryRow(
      'SELECT all_packs FROM pods WHERE id = $1',
      [podId]
    )
    const allPacks: unknown[][] = typeof podWithPacks?.all_packs === 'string'
      ? JSON.parse(podWithPacks.all_packs)
      : podWithPacks?.all_packs as unknown[][]

    // Assign pack 1 to each player (by seat order, 0-indexed)
    for (let i = 0; i < players.length; i++) {
      const player = players[i]
      const pack = allPacks[i][0] as { cards?: RawCard[] } | RawCard[] // Pack 1 for this player
      const packCards = (pack as { cards?: RawCard[] }).cards || pack // Extract cards array from pack object

      await query(
        `UPDATE pod_players
         SET current_pack = $1,
             pick_status = 'picking'
         WHERE id = $2`,
        [JSON.stringify(packCards), player.id]
      )
    }

    await query(
      `UPDATE pods
       SET draft_state = $1,
           state_version = state_version + 1,
           pick_started_at = NOW(),
           paused_duration_seconds = 0
       WHERE id = $2`,
      [JSON.stringify(draftState), podId]
    )
  }

  return true
}

/**
 * Pass leaders between players
 */
async function passLeaders(players: DraftPlayer[], direction: 'left' | 'right'): Promise<void> {
  // Collect all remaining leaders
  const leadersByPlayer: { playerId: string; seatNumber: number; leaders: RawCard[] }[] = []
  for (const player of players) {
    const leaders: RawCard[] = typeof player.leaders === 'string'
      ? JSON.parse(player.leaders)
      : player.leaders || []
    leadersByPlayer.push({ playerId: player.id, seatNumber: player.seat_number, leaders })
  }

  // Calculate new assignments
  const totalSeats = players.length
  for (const playerData of leadersByPlayer) {
    const nextSeat = getNextSeat(playerData.seatNumber, direction, totalSeats)
    const nextPlayer = players.find(p => p.seat_number === nextSeat)
    if (nextPlayer) {
      await query(
        'UPDATE pod_players SET leaders = $1 WHERE id = $2',
        [JSON.stringify(playerData.leaders), nextPlayer.id]
      )
    }
  }
}

/**
 * Check if all players picked and advance pack draft
 */
export async function checkAndAdvancePackDraft(
  podId: string,
  draftState: DraftState,
  pod: DraftPod
): Promise<boolean> {
  const players = await queryRows(
    'SELECT * FROM pod_players WHERE pod_id = $1 ORDER BY seat_number',
    [podId]
  )

  const allPicked = players.every(p => p.pick_status === 'picked')
  if (!allPicked) {
    // Just increment state version
    await query(
      'UPDATE pods SET state_version = state_version + 1 WHERE id = $1',
      [podId]
    )
    return false
  }

  // All players have picked
  const packNumber = draftState.packNumber || 1
  const pickInPack = draftState.pickInPack || 1
  const totalPacks = getTotalPacks(draftState, pod)

  // Check if current pack is exhausted
  const firstPlayer = players[0]
  const remainingPack: RawCard[] = parseCurrentPack(firstPlayer.current_pack)

  if (remainingPack.length === 0) {
    // Pack is done, move to next pack or complete draft
    if (packNumber >= totalPacks) {
      // Draft complete!
      await query(
        `UPDATE pods
         SET status = 'complete',
             draft_state = $1,
             completed_at = NOW(),
             state_version = state_version + 1
         WHERE id = $2`,
        [JSON.stringify({ ...draftState, phase: 'complete' }), podId]
      )

      // Build decks for bot players (fire-and-forget)
      const podForBots = await queryRow('SELECT * FROM pods WHERE id = $1', [podId])
      const botSettings = typeof podForBots?.settings === 'string' ? JSON.parse(podForBots.settings) : podForBots?.settings || {}
      buildBotDecks(podId, podForBots?.set_code || draftState.setCode || '', botSettings).catch(err =>
        console.error('[BOT_DECK] Error building bot decks:', err)
      )

      // Set deck build deadline for competitive pods
      if (podForBots?.competitive) {
        const deckLockAt = new Date(Date.now() + 20 * 60 * 1000).toISOString()
        await query(
          `UPDATE pods SET deck_lock_at = $2 WHERE id = $1`,
          [podId, deckLockAt]
        )
      }

      return true
    }

    // Move to next pack
    draftState.packNumber = packNumber + 1
    draftState.pickInPack = 1
    delete draftState.lastPlayerStartedAt // Clear last player timer for new pack

    // Fetch all_packs only when moving to next pack
    const podWithPacks = await queryRow(
      'SELECT all_packs FROM pods WHERE id = $1',
      [podId]
    )
    const allPacks: unknown[][] = typeof podWithPacks?.all_packs === 'string'
      ? JSON.parse(podWithPacks.all_packs)
      : podWithPacks?.all_packs as unknown[][]

    // Assign next pack to each player
    for (let i = 0; i < players.length; i++) {
      const player = players[i]
      const pack = allPacks[i][packNumber] as { cards?: RawCard[] } | RawCard[] // Next pack (0-indexed array, packNumber is the old value which equals new index)
      const packCards = (pack as { cards?: RawCard[] }).cards || pack // Extract cards array from pack object

      await query(
        `UPDATE pod_players
         SET current_pack = $1,
             pick_status = 'picking'
         WHERE id = $2`,
        [JSON.stringify(packCards), player.id]
      )
    }

    await query(
      `UPDATE pods
       SET draft_state = $1,
           state_version = state_version + 1,
           pick_started_at = NOW(),
           paused_duration_seconds = 0
       WHERE id = $2`,
      [JSON.stringify(draftState), podId]
    )

  } else {
    // Pass packs and continue
    const direction = getPassDirection(packNumber)
    await passPacks(players, direction)

    // Update state
    draftState.pickInPack = pickInPack + 1
    delete draftState.lastPlayerStartedAt // Clear last player timer for new pick

    await query(
      `UPDATE pods
       SET draft_state = $1,
           state_version = state_version + 1,
           pick_started_at = NOW(),
           paused_duration_seconds = 0
       WHERE id = $2`,
      [JSON.stringify(draftState), podId]
    )

    // Reset pick status
    await query(
      `UPDATE pod_players
       SET pick_status = 'picking'
       WHERE pod_id = $1`,
      [podId]
    )
  }

  return true
}

/**
 * Pass packs between players
 */
async function passPacks(players: DraftPlayer[], direction: 'left' | 'right'): Promise<void> {
  // Collect all current packs
  const packsByPlayer: { playerId: string; seatNumber: number; pack: RawCard[] }[] = []
  for (const player of players) {
    const currentPack: RawCard[] = parseCurrentPack(player.current_pack)
    packsByPlayer.push({ playerId: player.id, seatNumber: player.seat_number, pack: currentPack })
  }

  // Calculate new assignments
  const totalSeats = players.length
  for (const playerData of packsByPlayer) {
    const nextSeat = getNextSeat(playerData.seatNumber, direction, totalSeats)
    const nextPlayer = players.find(p => p.seat_number === nextSeat)
    if (nextPlayer) {
      await query(
        'UPDATE pod_players SET current_pack = $1 WHERE id = $2',
        [JSON.stringify(playerData.pack), nextPlayer.id]
      )
    }
  }
}
