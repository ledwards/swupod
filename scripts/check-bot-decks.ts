#!/usr/bin/env npx tsx
// Check bot deck legality for a given draft
// Usage: DATABASE_URL=... npx tsx scripts/check-bot-decks.ts YLySztif
// Or:   railway run -e production npx tsx scripts/check-bot-decks.ts YLySztif

import { query } from '../lib/db'

const draftShareId = process.argv[2]
if (!draftShareId) {
  console.error('Usage: npx tsx scripts/check-bot-decks.ts <draftShareId>')
  process.exit(1)
}

async function main() {
  const rows = await query(
    `SELECT u.username, pp.is_bot, pp.strategy_name, pp.mixin_name,
            cp.share_id, cp.deck_builder_state
     FROM pod_players pp
     JOIN pods p ON pp.pod_id = p.id
     LEFT JOIN users u ON u.id = pp.user_id
     LEFT JOIN card_pools cp ON cp.user_id = pp.user_id AND cp.pod_id = p.id
     WHERE p.share_id = $1 AND pp.is_bot = true
     ORDER BY pp.seat_number`,
    [draftShareId]
  )

  let totalIssues = 0

  for (const row of rows.rows) {
    const state = typeof row.deck_builder_state === 'string'
      ? JSON.parse(row.deck_builder_state)
      : row.deck_builder_state

    if (!state || !state.cardPositions) {
      console.log(`\n❌ ${row.username} - NO DECK BUILT (pool: ${row.share_id})`)
      totalIssues++
      continue
    }

    const positions = state.cardPositions
    const activeLeader = state.activeLeaderPos || state.activeLeader
    const activeBase = state.activeBasePos || state.activeBase
    let leaderCard: any = null
    let baseCard: any = null
    const deckCards: any[] = []
    const sideboardCards: any[] = []

    Object.entries(positions).forEach(([k, v]: [string, any]) => {
      if (k === activeLeader) leaderCard = v.card
      else if (k === activeBase) baseCard = v.card
      else if (v.section === 'deck') deckCards.push(v.card)
      else if (v.section === 'sideboard') sideboardCards.push(v.card)
    })

    console.log(`\n=== ${row.username} (${row.strategy_name}/${row.mixin_name}) ===`)
    console.log(`Pool: ${row.share_id}`)
    console.log(`Leader: ${leaderCard?.name} — ${(leaderCard?.aspects || []).join(', ')}`)
    console.log(`Base: ${baseCard?.name} — ${(baseCard?.aspects || []).join(', ')}`)
    console.log(`Deck: ${deckCards.length} cards, Sideboard: ${sideboardCards.length} cards`)

    const leaderAspects: string[] = leaderCard?.aspects || []
    const leaderAlignment = leaderAspects.includes('Villainy') ? 'Villainy'
      : leaderAspects.includes('Heroism') ? 'Heroism' : null
    const opposingAlignment = leaderAlignment === 'Villainy' ? 'Heroism'
      : leaderAlignment === 'Heroism' ? 'Villainy' : null
    const leaderColors = leaderAspects.filter(a => !['Heroism', 'Villainy'].includes(a))
    const baseColors = (baseCard?.aspects || []).filter((a: string) => !['Heroism', 'Villainy'].includes(a))
    const inAspectColors = [...new Set([...leaderColors, ...baseColors])]

    let hasIssues = false

    // Check deck size
    if (deckCards.length !== 30) {
      console.log(`  ❌ DECK SIZE: ${deckCards.length} (expected 30)`)
      hasIssues = true
    }

    // Check for opposing alignment cards
    let opposingCount = 0
    deckCards.forEach((c: any) => {
      const aspects = c.aspects || []
      if (opposingAlignment && aspects.includes(opposingAlignment)) {
        opposingCount++
        console.log(`  ❌ OPPOSING ALIGNMENT: ${c.name} [${aspects.join(', ')}]`)
      }
    })
    if (opposingCount > 0) {
      console.log(`  ❌ TOTAL OPPOSING: ${opposingCount} (expected 0)`)
      hasIssues = true
    }

    // Check off-aspect cards
    let offAspectCount = 0
    deckCards.forEach((c: any) => {
      const aspects = c.aspects || []
      const cardColors = aspects.filter((a: string) => !['Heroism', 'Villainy'].includes(a))
      if (cardColors.length > 0 && !cardColors.some((a: string) => inAspectColors.includes(a))) {
        offAspectCount++
        console.log(`  ⚠️  OFF-ASPECT: ${c.name} [${aspects.join(', ')}]`)
      }
    })
    if (offAspectCount > 5) {
      console.log(`  ❌ OFF-ASPECT: ${offAspectCount} (max 5 for LAW)`)
      hasIssues = true
    } else if (offAspectCount > 0) {
      console.log(`  ✅ Off-aspect: ${offAspectCount} (within LAW splash limit)`)
    }

    // Check base color adds new color
    const baseNewColors = baseColors.filter((c: string) => !leaderColors.includes(c))
    if (baseNewColors.length === 0 && baseColors.length > 0) {
      console.log(`  ❌ BASE: ${baseCard?.name} does NOT add a new color (leader: ${leaderColors.join(',')}, base: ${baseColors.join(',')})`)
      hasIssues = true
    }

    if (!hasIssues) {
      console.log(`  ✅ All checks pass`)
    } else {
      totalIssues++
    }

    console.log(`  Colors: ${inAspectColors.join(', ')}`)
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`${totalIssues === 0 ? '✅' : '❌'} ${totalIssues} bot(s) with issues out of ${rows.rows.length}`)

  process.exit(totalIssues > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
