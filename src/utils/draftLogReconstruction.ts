// @ts-nocheck
/**
 * Draft Log Reconstruction
 *
 * Pure functions to reconstruct what each player saw during a draft.
 * Given the original packs and all players' picks, rebuilds the exact
 * card pool visible at each pick.
 */

import { getPassDirection, getLeaderPassDirection } from './draftLogic'

// === TYPES ===

export interface DraftedCard {
  instanceId: string
  packNumber: number    // 1-3
  pickInPack: number    // 1-14
  pickNumber: number    // overall pick number
  [key: string]: unknown
}

export interface DraftedLeader {
  instanceId: string
  leaderRound: number   // 1-3
  [key: string]: unknown
}

export interface DraftPack {
  cards: Array<{ instanceId: string; [key: string]: unknown }>
}

export interface PlayerData {
  seatNumber: number    // 1-indexed
  draftedCards: DraftedCard[]
  draftedLeaders: DraftedLeader[]
  username?: string
}

export interface DraftLogInput {
  targetSeat: number      // 1-indexed seat of the player whose log we want
  totalSeats: number      // total players in the draft
  allPacks: DraftPack[][] // [playerIndex][packIndex] = { cards: [...] }
  players: PlayerData[]   // all players with their picks
}

export interface DraftLogPick {
  type: 'leader' | 'card'
  packNumber: number      // 1-3
  pickInPack: number      // 1-based pick within pack (or leader round)
  overallPickNumber: number
  visibleCards: Array<{ instanceId: string; [key: string]: unknown }>
  pickedInstanceId: string | null
}

// === HELPERS ===

/**
 * Convert 1-indexed seat to 0-indexed.
 */
function seatToIndex(seat: number): number {
  return seat - 1
}

/**
 * Get the player data for a given seat number.
 */
function getPlayerBySeat(players: PlayerData[], seat: number): PlayerData | undefined {
  return players.find(p => p.seatNumber === seat)
}

// === LEADER RECONSTRUCTION ===

/**
 * Reconstruct original leader packs from all players' draftedLeaders.
 *
 * Leaders always pass right. For round R, the picker at index `pickerIdx`
 * picked from source pack `(pickerIdx - (R-1) + N) % N`.
 *
 * We invert this: for each player's draftedLeaders entry at round R,
 * we compute which original pack it came from and collect them.
 *
 * Returns: originalLeaders[playerIndex] = array of leader cards
 */
export function reconstructOriginalLeaderPacks(
  players: PlayerData[],
  totalSeats: number
): Array<Array<{ instanceId: string; [key: string]: unknown }>> {
  const originalLeaders: Array<Array<{ instanceId: string; [key: string]: unknown }>> = []
  for (let i = 0; i < totalSeats; i++) {
    originalLeaders.push([])
  }

  for (const player of players) {
    const pickerIdx = seatToIndex(player.seatNumber)
    for (const leader of player.draftedLeaders) {
      const round = leader.leaderRound
      // Leaders pass right. Source for round R picked by pickerIdx:
      // sourceIdx = (pickerIdx - (R-1) + N) % N
      const sourceIdx = ((pickerIdx - (round - 1)) % totalSeats + totalSeats) % totalSeats
      originalLeaders[sourceIdx].push(leader)
    }
  }

  return originalLeaders
}

/**
 * Reconstruct the leader picks for the target player.
 *
 * For leader round R, the target sees a pack from:
 *   sourceIdx = (targetIdx - (R-1) + N) % N
 *
 * Prior picks (rounds 1..R-1) were made by:
 *   round j picker: (sourceIdx + (j-1)) % N
 */
function reconstructLeaderPicks(
  targetSeat: number,
  totalSeats: number,
  players: PlayerData[],
  originalLeaders: Array<Array<{ instanceId: string; [key: string]: unknown }>>
): DraftLogPick[] {
  const targetIdx = seatToIndex(targetSeat)
  const picks: DraftLogPick[] = []
  const leaderRounds = Math.min(3, totalSeats) // can't have more rounds than players

  for (let round = 1; round <= leaderRounds; round++) {
    // Which original pack is in front of target?
    const sourceIdx = ((targetIdx - (round - 1)) % totalSeats + totalSeats) % totalSeats
    const originalPack = [...originalLeaders[sourceIdx]]

    // Remove prior picks (rounds 1..round-1)
    const removedIds = new Set<string>()
    for (let j = 1; j < round; j++) {
      // Who picked from this pack at round j?
      const pickerIdx = (sourceIdx + (j - 1)) % totalSeats
      const pickerSeat = pickerIdx + 1
      const picker = getPlayerBySeat(players, pickerSeat)
      if (picker) {
        const pickerLeader = picker.draftedLeaders.find(l => l.leaderRound === j)
        if (pickerLeader) {
          removedIds.add(pickerLeader.instanceId)
        }
      }
    }

    const visibleCards = originalPack.filter(c => !removedIds.has(c.instanceId))

    // What did the target pick?
    const targetPlayer = getPlayerBySeat(players, targetSeat)
    const targetLeader = targetPlayer?.draftedLeaders.find(l => l.leaderRound === round)

    picks.push({
      type: 'leader',
      packNumber: 0, // leaders don't have a pack number in the traditional sense
      pickInPack: round,
      overallPickNumber: round,
      visibleCards,
      pickedInstanceId: targetLeader?.instanceId || null,
    })
  }

  return picks
}

// === CARD PICK RECONSTRUCTION ===

/**
 * Reconstruct the card picks for the target player across all 3 packs.
 *
 * For pack P, pick K:
 * 1. Determine source pack (which physical pack is in front of them)
 * 2. Determine prior picks (cards removed before player sees it)
 * 3. Visible cards = original pack - prior picks
 */
function reconstructCardPicks(
  targetSeat: number,
  totalSeats: number,
  allPacks: DraftPack[][],
  players: PlayerData[]
): DraftLogPick[] {
  const targetIdx = seatToIndex(targetSeat)
  const picks: DraftLogPick[] = []
  const cardsPerPack = allPacks[0]?.[0]?.cards?.length || 14

  for (let packNum = 1; packNum <= 3; packNum++) {
    const direction = getPassDirection(packNum)
    const packIdx = packNum - 1

    for (let pickK = 1; pickK <= cardsPerPack; pickK++) {
      // 1. Source pack: which original pack is in front of target at this pick?
      let sourceIdx: number
      if (direction === 'left') {
        // Pass left: pack moves from higher seat to lower seat
        // At pick K, the pack that started at (targetIdx + (K-1)) has arrived
        sourceIdx = (targetIdx + (pickK - 1)) % totalSeats
      } else {
        // Pass right: pack moves from lower seat to higher seat
        sourceIdx = ((targetIdx - (pickK - 1)) % totalSeats + totalSeats) % totalSeats
      }

      // Get the original pack
      const originalPack = allPacks[sourceIdx]?.[packIdx]
      if (!originalPack) {
        console.warn(`[DraftLog] Missing pack data: sourceIdx=${sourceIdx}, packIdx=${packIdx}, pack=${packNum}, pick=${pickK}`)
        picks.push({
          type: 'card',
          packNumber: packNum,
          pickInPack: pickK,
          overallPickNumber: (packNum - 1) * cardsPerPack + pickK,
          visibleCards: [],
          pickedInstanceId: null,
        })
        continue
      }

      const originalCards = [...originalPack.cards]

      // 2. Remove prior picks (picks 1..K-1 from this pack)
      const removedIds = new Set<string>()
      for (let j = 1; j < pickK; j++) {
        // Who had this pack at pick j?
        let pickerIdx: number
        if (direction === 'left') {
          // Pack started at sourceIdx, passed left j-1 times
          pickerIdx = ((sourceIdx - (j - 1)) % totalSeats + totalSeats) % totalSeats
        } else {
          // Pack started at sourceIdx, passed right j-1 times
          pickerIdx = (sourceIdx + (j - 1)) % totalSeats
        }

        const pickerSeat = pickerIdx + 1
        const picker = getPlayerBySeat(players, pickerSeat)
        if (picker) {
          const pickerCard = picker.draftedCards.find(
            c => c.packNumber === packNum && c.pickInPack === j
          )
          if (pickerCard) {
            removedIds.add(pickerCard.instanceId)
          }
        }
      }

      const visibleCards = originalCards.filter(c => !removedIds.has(c.instanceId))

      // 3. What did the target pick?
      const targetPlayer = getPlayerBySeat(players, targetSeat)
      const targetCard = targetPlayer?.draftedCards.find(
        c => c.packNumber === packNum && c.pickInPack === pickK
      )

      const overallPickNumber = (packNum - 1) * cardsPerPack + pickK

      picks.push({
        type: 'card',
        packNumber: packNum,
        pickInPack: pickK,
        overallPickNumber,
        visibleCards,
        pickedInstanceId: targetCard?.instanceId || null,
      })
    }
  }

  return picks
}

// === MAIN EXPORT ===

/**
 * Reconstruct the complete draft log for a target player.
 *
 * Returns picks in chronological order:
 * 1. Leader draft (3 rounds, passing right)
 * 2. Pack 1 (14 picks, passing left)
 * 3. Pack 2 (14 picks, passing right)
 * 4. Pack 3 (14 picks, passing left)
 */
export function reconstructDraftLog(input: DraftLogInput): DraftLogPick[] {
  const { targetSeat, totalSeats, allPacks, players } = input

  // Reconstruct original leader packs from everyone's picks
  const originalLeaders = reconstructOriginalLeaderPacks(players, totalSeats)

  // Reconstruct leader picks
  const leaderPicks = reconstructLeaderPicks(targetSeat, totalSeats, players, originalLeaders)

  // Reconstruct card picks
  const cardPicks = reconstructCardPicks(targetSeat, totalSeats, allPacks, players)

  return [...leaderPicks, ...cardPicks]
}
