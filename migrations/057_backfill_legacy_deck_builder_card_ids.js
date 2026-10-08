/**
 * Migration 057: Backfill missing deck_builder_state card.cardId values
 *
 * WHAT THIS FIXES
 * ===============
 * A bounded set of legacy deck_builder_state rows saved card objects like:
 *   { id: "SEC-270", cardId: null, ... }
 *
 * For those rows, `id` held the external card identifier instead of the
 * internal CMS id, and `cardId` was missing entirely. Modern export code
 * expects `cardId` to be present, so these decks can fail export.
 *
 * SIMPLE DATA REPAIR
 * ==================
 * For any deck_builder_state.cardPositions[*].card where:
 * - `cardId` is missing/null/empty
 * - `id` looks like an external card id (SET-123 or SET_123)
 *
 * we backfill:
 *   card.cardId = normalized(card.id)
 *
 * We intentionally do not rewrite `card.id` here. This keeps the migration
 * narrowly focused on the missing field that export depends on.
 *
 * SAFETY
 * ======
 * - Idempotent: rows with cardId already set are skipped
 * - Bounded: only touches deck_builder_state on affected rows
 * - Preserves original `updated_at` by temporarily disabling the auto-update trigger
 */

const LEGACY_EXTERNAL_ID_REGEX = /^[A-Z]{3}[-_]\d+$/

function normalizeLegacyExternalCardId(rawId) {
  if (typeof rawId !== 'string') return null
  const trimmed = rawId.trim()
  if (!LEGACY_EXTERNAL_ID_REGEX.test(trimmed)) return null

  const [setCode, numberPart] = trimmed.split(/[-_]/)
  const number = parseInt(numberPart, 10)
  if (Number.isNaN(number)) return null

  return `${setCode}-${number}`
}

function backfillDeckBuilderState(deckBuilderState) {
  if (!deckBuilderState || typeof deckBuilderState !== 'object') {
    return { deckBuilderState, fixedCards: 0 }
  }

  const cardPositions = deckBuilderState.cardPositions
  if (!cardPositions || typeof cardPositions !== 'object') {
    return { deckBuilderState, fixedCards: 0 }
  }

  let fixedCards = 0
  const fixedPositions = {}

  for (const [posId, pos] of Object.entries(cardPositions)) {
    if (!pos || typeof pos !== 'object' || !pos.card || typeof pos.card !== 'object') {
      fixedPositions[posId] = pos
      continue
    }

    const card = pos.card
    const hasCardId = typeof card.cardId === 'string' && card.cardId.trim() !== ''
    const normalizedCardId = !hasCardId ? normalizeLegacyExternalCardId(card.id) : null

    if (!normalizedCardId) {
      fixedPositions[posId] = pos
      continue
    }

    fixedCards++
    fixedPositions[posId] = {
      ...pos,
      card: {
        ...card,
        cardId: normalizedCardId,
      },
    }
  }

  if (fixedCards === 0) {
    return { deckBuilderState, fixedCards: 0 }
  }

  return {
    deckBuilderState: {
      ...deckBuilderState,
      cardPositions: fixedPositions,
    },
    fixedCards,
  }
}

export async function run(client) {
  console.log('   Finding legacy deck_builder_state rows missing cardId...')

  const result = await client.query(`
    SELECT id, share_id, updated_at, deck_builder_state
    FROM card_pools
    WHERE deck_builder_state IS NOT NULL
      AND jsonb_path_exists(
        deck_builder_state,
        '$.cardPositions.*.card ? (@.id like_regex "^[A-Z]{3}[-_][0-9]+$" && (!exists(@.cardId) || @.cardId == null || @.cardId == ""))'
      )
    ORDER BY updated_at
  `)

  console.log(`   Found ${result.rows.length} affected pools`)

  if (result.rows.length === 0) {
    console.log('   Nothing to backfill')
    return
  }

  let poolsFixed = 0
  let cardsFixed = 0

  await client.query('BEGIN')

  try {
    await client.query('ALTER TABLE card_pools DISABLE TRIGGER update_card_pools_updated_at')

    for (const row of result.rows) {
      const deckBuilderState = typeof row.deck_builder_state === 'string'
        ? JSON.parse(row.deck_builder_state)
        : row.deck_builder_state

      const fixed = backfillDeckBuilderState(deckBuilderState)
      if (fixed.fixedCards === 0) continue

      await client.query(
        'UPDATE card_pools SET deck_builder_state = $1 WHERE id = $2',
        [JSON.stringify(fixed.deckBuilderState), row.id]
      )

      poolsFixed++
      cardsFixed += fixed.fixedCards
    }

    await client.query('ALTER TABLE card_pools ENABLE TRIGGER update_card_pools_updated_at')
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }

  console.log(`   Backfilled ${cardsFixed} cards across ${poolsFixed} pools`)
}

export { backfillDeckBuilderState, normalizeLegacyExternalCardId }
