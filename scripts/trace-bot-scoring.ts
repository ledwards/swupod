#!/usr/bin/env npx tsx
/**
 * Trace the scoring for a specific bot to understand why it drafts off-aspect cards.
 * Usage: DATABASE_URL=... npx tsx scripts/trace-bot-scoring.ts [botName]
 */

import { query } from '../lib/db'
import { createStrategy } from '../src/bots/behaviors/index'
import { ALL_MIXINS } from '../src/bots/behaviors/mixins'

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']

async function main() {
  const botName = process.argv[2] || 'DraftBot Eta'

  const rows = await query(
    `SELECT u.username, pp.strategy_name, pp.mixin_name, pp.drafted_cards, pp.drafted_leaders
     FROM pod_players pp JOIN pods p ON pp.pod_id = p.id LEFT JOIN users u ON u.id = pp.user_id
     WHERE p.share_id = 'YLySztif' AND pp.is_bot = true AND u.username = $1`,
    [botName]
  )

  const row = rows.rows[0]
  if (!row) { console.error('Bot not found'); process.exit(1) }

  const draftedLeaders = typeof row.drafted_leaders === 'string'
    ? JSON.parse(row.drafted_leaders) : row.drafted_leaders || []
  const draftedCards = typeof row.drafted_cards === 'string'
    ? JSON.parse(row.drafted_cards) : row.drafted_cards || []

  const mixinObj = row.mixin_name
    ? ALL_MIXINS.find((m: any) => m.name === row.mixin_name) || null : null
  const strategy = createStrategy(row.strategy_name, mixinObj)
  const leader = strategy.selectLeader(draftedLeaders, { setCode: 'LAW' })

  const leaderAspects: string[] = leader.aspects || []
  const leaderColors = leaderAspects.filter(a => COLOR_ASPECTS.includes(a))
  const baseColor = COLOR_ASPECTS.find(c => !leaderColors.includes(c)) || 'Cunning'

  strategy.committedLeader = leader
  strategy.committedBaseColor = baseColor

  const inAspect = [...new Set([...leaderColors, baseColor])]
  console.log(`=== ${botName} (${row.strategy_name}/${row.mixin_name}) ===`)
  console.log(`Leader: ${leader.name} [${leaderAspects.join(', ')}]`)
  console.log(`Base color: ${baseColor}`)
  console.log(`In-aspect: ${inAspect.join(', ')}`)
  console.log(`\nOFF-ASPECT cards in drafted pool:\n`)

  let offInPool = 0
  for (const card of draftedCards) {
    if (card.isLeader || card.isBase) continue
    const cardColors = (card.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
    const isOff = cardColors.length > 0 && !cardColors.some((a: string) => inAspect.includes(a))

    if (isOff) {
      offInPool++
      const score = strategy._scoreCard(card, [leader], draftedCards, 42, null, { setCode: 'LAW' })
      const colorScore = strategy._calculateColorScore(card, [leader], true, { setCode: 'LAW' })
      const splashBonus = strategy._calculateLAWSplashBonus(card, draftedCards, { setCode: 'LAW' })
      const qualityScore = strategy._calculateQualityScore(card, null, { setCode: 'LAW' })

      console.log(`  ${card.name} [${(card.aspects || []).join(',')}] rarity=${card.rarity} pick=${card.pickNumber || '?'}`)
      console.log(`    total=${score.toFixed(0)}  color=${colorScore}  splash=${splashBonus}  quality=${qualityScore.toFixed(0)}`)
    }
  }

  console.log(`\nTotal off-aspect in pool: ${offInPool} out of ${draftedCards.filter((c: any) => !c.isLeader && !c.isBase).length}`)

  // Now trace in-aspect cards for comparison
  console.log(`\nSample IN-ASPECT cards for comparison:\n`)
  let shown = 0
  for (const card of draftedCards) {
    if (card.isLeader || card.isBase) continue
    const cardColors = (card.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
    const isOff = cardColors.length > 0 && !cardColors.some((a: string) => inAspect.includes(a))

    if (!isOff && shown < 5) {
      shown++
      const score = strategy._scoreCard(card, [leader], draftedCards, 42, null, { setCode: 'LAW' })
      const colorScore = strategy._calculateColorScore(card, [leader], true, { setCode: 'LAW' })
      const qualityScore = strategy._calculateQualityScore(card, null, { setCode: 'LAW' })
      console.log(`  ${card.name} [${(card.aspects || []).join(',')}] rarity=${card.rarity}`)
      console.log(`    total=${score.toFixed(0)}  color=${colorScore}  quality=${qualityScore.toFixed(0)}`)
    }
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
