// @ts-nocheck
/**
 * Pool/deck assembly service (server-only, pure).
 *
 * Takes resolved rows + active leader/base ids and produces:
 *   - cards: flat RawCard[] of length 96 (each copy is one entry)
 *   - deckBuilderState: { cardPositions, activeLeader, activeBase, deckCardIds, sideboardCardIds, poolName }
 *   - validationErrors: structured codes if the input doesn't satisfy the SPIKE invariants
 *
 * Position-key convention matches DeckBuilder.tsx:1308-1322 (leaders-bases) and
 * DeckBuilder.tsx:1339-1354 (pool):
 *   - Leaders:  `leader-${index}-${card.id}`
 *   - Bases:    `base-${index}-${card.id}`
 *   - Pool:     `pool-${index}-${card.id}`
 *
 * Leaders and bases ALWAYS go to the 'leaders-bases' section. DeckBuilder.tsx:915
 * silently drops leaders/bases placed in 'deck' or 'sideboard' on restoration —
 * the regression test suite covers this seam.
 *
 * See docs/plans/2026-05-05-001-feat-import-pool-spike-plan.md U4.
 */

import type { RawCard } from '../../utils/cardData'

export interface ResolvedRow {
  card: RawCard
  poolQty: number
  deckQty: number
}

export interface ValidationError {
  code: 'POOL_SIZE' | 'INVALID_QTY' | 'INVALID_LEADER' | 'INVALID_BASE' | 'TITLE_TOO_LONG' | 'UNKNOWN_CARD'
  message: string
  detail?: Record<string, unknown>
  expected?: number
  got?: number
}

interface BuildPoolInput {
  resolvedRows: ResolvedRow[]
  activeLeaderId: string  // The card.id (UUID) of the chosen leader
  activeBaseId: string    // The card.id (UUID) of the chosen base
  setCode: string
  poolName: string
  isDefaultName?: boolean
}


interface BuildPoolOutput {
  cards: RawCard[]
  deckBuilderState: {
    poolName: string
    isDefaultName: boolean
    cardPositions: Record<string, {
      card: RawCard
      section: 'deck' | 'sideboard' | 'leaders-bases'
      enabled: boolean
      visible: boolean
      x: number
      y: number
      zIndex: number
    }>
    activeLeader: string | null
    activeBase: string | null
    deckCardIds: string[]
    sideboardCardIds: string[]
  }
  validationErrors: ValidationError[]
}

const EXPECTED_POOL_SIZE = 96

export function buildPool({
  resolvedRows,
  activeLeaderId,
  activeBaseId,
  setCode,
  poolName,
  isDefaultName = false,
}: BuildPoolInput): BuildPoolOutput {
  const validationErrors: ValidationError[] = []

  // 1. Per-row qty sanity check
  for (const row of resolvedRows) {
    if (row.deckQty > row.poolQty) {
      validationErrors.push({
        code: 'INVALID_QTY',
        message: `deckQty (${row.deckQty}) exceeds poolQty (${row.poolQty}) for ${row.card.name}`,
        detail: { cardId: row.card.cardId, name: row.card.name, poolQty: row.poolQty, deckQty: row.deckQty },
      })
    }
  }

  // 2. Total pool size check
  const totalPoolSize = resolvedRows.reduce((sum, row) => sum + row.poolQty, 0)
  if (totalPoolSize !== EXPECTED_POOL_SIZE) {
    validationErrors.push({
      code: 'POOL_SIZE',
      message: `Pool must be ${EXPECTED_POOL_SIZE} cards, got ${totalPoolSize}`,
      expected: EXPECTED_POOL_SIZE,
      got: totalPoolSize,
    })
  }

  // 3. Active leader / base checks (must exist in rows; must actually be Leader/Base)
  const leaderRow = resolvedRows.find(r => r.card.id === activeLeaderId)
  if (!leaderRow) {
    validationErrors.push({
      code: 'INVALID_LEADER',
      message: `Active leader id "${activeLeaderId}" not found in resolved rows`,
    })
  } else if (!leaderRow.card.isLeader) {
    validationErrors.push({
      code: 'INVALID_LEADER',
      message: `Card "${leaderRow.card.name}" (${leaderRow.card.cardId}) is not a leader`,
    })
  }

  const baseRow = resolvedRows.find(r => r.card.id === activeBaseId)
  if (!baseRow) {
    validationErrors.push({
      code: 'INVALID_BASE',
      message: `Active base id "${activeBaseId}" not found in resolved rows`,
    })
  } else if (!baseRow.card.isBase) {
    validationErrors.push({
      code: 'INVALID_BASE',
      message: `Card "${baseRow.card.name}" (${baseRow.card.cardId}) is not a base`,
    })
  }

  // 4. Build the flat cards array AND cardPositions in one pass.
  const cards: RawCard[] = []
  const cardPositions: BuildPoolOutput['deckBuilderState']['cardPositions'] = {}

  let leaderIndex = 0
  let baseIndex = 0
  let poolIndex = 0
  let activeLeaderKey: string | null = null
  let activeBaseKey: string | null = null

  for (const row of resolvedRows) {
    if (row.card.isLeader) {
      // Each leader row should be poolQty=1 by spec, but we tolerate >1 defensively.
      for (let copy = 0; copy < row.poolQty; copy++) {
        const key = `leader-${leaderIndex}-${row.card.id}`
        cardPositions[key] = {
          card: row.card,
          section: 'leaders-bases',
          enabled: true,
          visible: true,
          x: 0,
          y: 0,
          zIndex: 1,
        }
        cards.push(row.card)
        if (row.card.id === activeLeaderId && activeLeaderKey === null) {
          activeLeaderKey = key
        }
        leaderIndex++
      }
    } else if (row.card.isBase) {
      for (let copy = 0; copy < row.poolQty; copy++) {
        const key = `base-${baseIndex}-${row.card.id}`
        cardPositions[key] = {
          card: row.card,
          section: 'leaders-bases',
          enabled: true,
          visible: true,
          x: 0,
          y: 0,
          zIndex: 1,
        }
        cards.push(row.card)
        if (row.card.id === activeBaseId && activeBaseKey === null) {
          activeBaseKey = key
        }
        baseIndex++
      }
    } else {
      // Other cards: first deckQty copies → deck, rest → sideboard
      const safeDeckQty = Math.min(Math.max(row.deckQty, 0), row.poolQty)
      for (let copy = 0; copy < row.poolQty; copy++) {
        const key = `pool-${poolIndex}-${row.card.id}`
        const inDeck = copy < safeDeckQty
        cardPositions[key] = {
          card: row.card,
          section: inDeck ? 'deck' : 'sideboard',
          enabled: inDeck,
          visible: true,
          x: 0,
          y: 0,
          zIndex: 1,
        }
        cards.push(row.card)
        poolIndex++
      }
    }
  }

  // 5. Derived id arrays (matches the trimmed UI projection used by buildDeckBuilderUiStorageState)
  const deckCardIds: string[] = []
  const sideboardCardIds: string[] = []
  for (const [key, pos] of Object.entries(cardPositions)) {
    if (pos.section === 'deck') deckCardIds.push(key)
    else if (pos.section === 'sideboard') sideboardCardIds.push(key)
  }

  return {
    cards,
    deckBuilderState: {
      poolName,
      isDefaultName,
      cardPositions,
      activeLeader: activeLeaderKey,
      activeBase: activeBaseKey,
      deckCardIds,
      sideboardCardIds,
    },
    validationErrors,
  }
}
