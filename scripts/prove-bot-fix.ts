#!/usr/bin/env npx tsx
/**
 * Prove the bot deck builder fix works.
 * Fetches real drafted cards from the problematic draft (YLySztif),
 * rebuilds each bot's deck with OLD logic (just slice top 30) vs
 * NEW logic (hard cap of 5 off-aspect), and shows the difference.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/prove-bot-fix.ts
 */

import { query } from '../lib/db'
import { createStrategy } from '../src/bots/behaviors/index'
import { ALL_MIXINS } from '../src/bots/behaviors/mixins'

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']
const DECK_SIZE = 30
const MAX_OFF_ASPECT = 5

async function main() {
  const draftShareId = process.argv[2] || 'YLySztif'

  const rows = await query(
    `SELECT u.username, pp.strategy_name, pp.mixin_name,
            pp.drafted_cards, pp.drafted_leaders
     FROM pod_players pp
     JOIN pods p ON pp.pod_id = p.id
     LEFT JOIN users u ON u.id = pp.user_id
     WHERE p.share_id = $1 AND pp.is_bot = true
     ORDER BY pp.seat_number`,
    [draftShareId]
  )

  console.log('=== REBUILDING BOT DECKS: OLD vs NEW LOGIC ===\n')
  let oldIllegalCount = 0
  let newIllegalCount = 0

  for (const row of rows.rows) {
    const draftedLeaders = typeof row.drafted_leaders === 'string'
      ? JSON.parse(row.drafted_leaders) : row.drafted_leaders || []
    const draftedCards = typeof row.drafted_cards === 'string'
      ? JSON.parse(row.drafted_cards) : row.drafted_cards || []

    if (draftedLeaders.length === 0) continue

    // Recreate strategy with same config as the draft
    const mixinObj = row.mixin_name
      ? ALL_MIXINS.find((m: any) => m.name === row.mixin_name) || null : null
    const strategy = createStrategy(row.strategy_name || undefined, mixinObj)
    const selectedLeader = strategy.selectLeader(draftedLeaders, { setCode: 'LAW' })
    if (!selectedLeader) continue

    const leaderAspects: string[] = selectedLeader.aspects || []
    const leaderColors = leaderAspects.filter(a => COLOR_ASPECTS.includes(a))
    const baseColor = COLOR_ASPECTS.find(c => !leaderColors.includes(c)) || 'Cunning'

    strategy.committedLeader = selectedLeader
    strategy.committedBaseColor = baseColor

    // Filter opposing alignment
    const leaderAlignment = leaderAspects.find(a => a === 'Heroism' || a === 'Villainy')
    const opposing = leaderAlignment === 'Villainy' ? 'Heroism'
      : leaderAlignment === 'Heroism' ? 'Villainy' : null

    const scoredCards = draftedCards
      .filter((c: any) => {
        if (c.isLeader || c.isBase) return false
        if (opposing && (c.aspects || []).includes(opposing)) return false
        return true
      })
      .map((card: any) => ({
        card,
        score: strategy._scoreCard(card, [selectedLeader], draftedCards, 42, null, { setCode: 'LAW' }),
      }))
      .sort((a: any, b: any) => b.score - a.score)

    const inAspect = [...new Set([...leaderColors, baseColor])]

    function countOffAspect(deck: any[]): { count: number; cards: string[] } {
      const offCards: string[] = []
      for (const c of deck) {
        const cc = (c.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
        if (cc.length > 0 && !cc.some((a: string) => inAspect.includes(a))) {
          offCards.push(`${c.name} [${cc.join(',')}]`)
        }
      }
      return { count: offCards.length, cards: offCards }
    }

    // OLD: just take top 30
    const oldDeck = scoredCards.slice(0, DECK_SIZE).map((s: any) => s.card)
    const oldResult = countOffAspect(oldDeck)

    // NEW: enforce hard cap
    const newDeck: any[] = []
    const newSideboard: any[] = []
    let offCount = 0
    for (const { card } of scoredCards) {
      const cc = ((card as any).aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
      const isOff = cc.length > 0 && !cc.some((a: string) => inAspect.includes(a))
      if (newDeck.length < DECK_SIZE) {
        if (isOff && offCount >= MAX_OFF_ASPECT) {
          newSideboard.push(card)
        } else {
          newDeck.push(card)
          if (isOff) offCount++
        }
      } else {
        newSideboard.push(card)
      }
    }
    const newResult = countOffAspect(newDeck)

    const oldIllegal = oldResult.count > 5
    const newIllegal = newResult.count > 5
    if (oldIllegal) oldIllegalCount++
    if (newIllegal) newIllegalCount++

    console.log(`=== ${row.username} (${row.strategy_name}/${row.mixin_name}) ===`)
    console.log(`  Leader: ${(selectedLeader as any).name} [${leaderAspects.join(', ')}]`)
    console.log(`  In-aspect colors: ${inAspect.join(', ')}`)
    console.log(`  OLD CODE: ${oldResult.count} off-aspect ${oldIllegal ? '❌ ILLEGAL' : '✅ OK'}`)
    if (oldIllegal) {
      for (const c of oldResult.cards) console.log(`    - ${c}`)
    }
    console.log(`  NEW CODE: ${newResult.count} off-aspect ${newIllegal ? '❌ STILL BROKEN' : '✅ LEGAL'}`)
    console.log(`  Deck: ${newDeck.length}, Sideboard: ${newSideboard.length}`)
    console.log()
  }

  console.log('='.repeat(60))
  console.log(`OLD CODE: ${oldIllegalCount} bot(s) with ILLEGAL decks (>5 off-aspect)`)
  console.log(`NEW CODE: ${newIllegalCount} bot(s) with ILLEGAL decks (>5 off-aspect)`)
  console.log()
  if (newIllegalCount === 0 && oldIllegalCount > 0) {
    console.log('✅ FIX VERIFIED: All previously-illegal decks are now legal.')
  } else if (newIllegalCount > 0) {
    console.log('❌ FIX INCOMPLETE: Some decks are still illegal.')
  } else {
    console.log('ℹ️  No illegal decks found with either approach for this draft.')
  }

  process.exit(newIllegalCount > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
