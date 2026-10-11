import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeCardCache, getCachedCards } from './cardCache'
import { constructBotDeck } from './botDeckConstruction'
import { isPlayableBotDeck } from './botDeckBuilder'
import { buildDeckFromState } from '../../lib/deckBuilder'
import { cardForDeckId } from './builtDeckCard'
import { normalizeCardId } from './cardNormalization'

/** A drafted bot: three leaders and 42 cards from the set, as the draft stores them. */
function draftedBot(set: string) {
  const cards = getCachedCards(set).filter(c => c.variantType === 'Normal')
  const leaders = cards.filter(c => c.isLeader).slice(0, 3)
  const playables = cards.filter(c => !c.isLeader && !c.isBase)
  const picks = Array.from({ length: 42 }, (_, i) => ({ ...playables[(i * 7) % playables.length]!, packNumber: Math.floor(i / 14) + 1, pickNumber: (i % 14) + 1 }))
  return { user_id: 'bot', drafted_leaders: JSON.stringify(leaders), drafted_cards: JSON.stringify(picks), strategy_name: null, mixin_name: null }
}

test('a bot auto-builds a legal deck from its pool: a drafted leader, a base, 30+ cards it drafted', async () => {
  await initializeCardCache()
  for (const set of ['HMW', 'ASH']) {
    const bot = draftedBot(set)
    const built = constructBotDeck(bot, set)
    assert.ok(built, `${set}: construction`)
    const deck = buildDeckFromState(built!.deckBuilderState as Parameters<typeof buildDeckFromState>[0], set)
    assert.ok(isPlayableBotDeck(deck), `${set}: playable`)
    const leader = cardForDeckId(deck.leader!.id, 'leader')!, base = cardForDeckId(deck.base!.id, 'base')!
    assert.ok(leader.isLeader && base.isBase, `${set}: leader and base resolve to a leader and a base`)
    const draftedLeaders = (JSON.parse(bot.drafted_leaders) as { name: string }[]).map(c => c.name)
    assert.ok(draftedLeaders.includes(leader.name), `${set}: the leader was drafted`)
    const draftedIds = new Set((JSON.parse(bot.drafted_cards) as { cardId: string }[]).map(c => normalizeCardId(c.cardId)))
    for (const entry of deck.deck) assert.ok(draftedIds.has(normalizeCardId(entry.id)), `${set}: ${entry.id} came from the pool`)
    const opposing = leader.aspects?.includes('Villainy') ? 'Heroism' : leader.aspects?.includes('Heroism') ? 'Villainy' : null
    if (opposing) for (const entry of deck.deck) assert.ok(!cardForDeckId(entry.id)?.aspects?.includes(opposing), `${set}: no ${opposing} cards`)
  }
})

test('built deck ids resolve to the Normal leader and base, not a Hyperspace card sharing the number', async () => {
  await initializeCardCache()
  const leader = getCachedCards('HMW').find(c => c.isLeader && c.variantType === 'Normal')!
  const id = normalizeCardId(leader.cardId)!
  assert.equal(cardForDeckId(id, 'leader')?.id, leader.id)
  assert.equal(cardForDeckId(leader.id, 'leader')?.id, leader.id)
  assert.equal(cardForDeckId('NOPE_999', 'leader'), null)
  assert.ok(!isPlayableBotDeck({ leader: { id: id, count: 1 }, base: null, deck: [{ id: 'x', count: 30 }], sideboard: [] }))
  assert.ok(!isPlayableBotDeck({ leader: { id, count: 1 }, base: { id: 'b', count: 1 }, deck: [{ id: 'x', count: 29 }], sideboard: [] }))
})
