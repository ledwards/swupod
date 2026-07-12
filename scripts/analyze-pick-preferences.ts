// @ts-nocheck
/**
 * Pick-preference analytics (v1): reconstructs every human pick's full contest
 * (chosen card vs the cards visible in the pack) from completed draft pods,
 * then aggregates per-card preference stats.
 *
 * Metrics per card identity (name+subtitle, treatment-invariant):
 *  - seen / picked / pickRate       — raw pick-rate-when-seen
 *  - aSeen / aPicked / aRate        — WITHIN-ASPECT contests only: counted when
 *    the picker chose a card of primary aspect A and ≥2 visible cards shared A.
 *    Controls for archetype commitment ("preferred over other cards in its
 *    color in the pack").
 *  - ata                            — average taken at (mean pick_in_pack when picked)
 *  - earlyRate                      — pick rate when seen at picks 1-3 (commitment-free)
 *
 * Bots are excluded. Aggregate output only — no player data.
 *
 * Usage:
 *   npx tsx scripts/analyze-pick-preferences.ts [--set=ASH] [--min-seen=20] [--top=25] [--out=path.json]
 *   (DATABASE_URL selects the DB; use prod public URL for real player data)
 */

import { queryRow, queryRows } from '../lib/db'
import { reconstructDraftLog } from '../src/utils/draftLogReconstruction'
import { writeFileSync } from 'fs'

const arg = (name, dflt) => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || dflt
const SET = arg('set', 'ASH')
const MIN_SEEN = Number(arg('min-seen', '20'))
const TOP = Number(arg('top', '25'))
const OUT = arg('out', '')

const MORALITY = new Set(['Villainy', 'Heroism'])
const primaryAspect = (c) => {
  const aspects = c?.aspects || []
  return aspects.find(a => !MORALITY.has(a)) || aspects[0] || null
}
const identity = (c) => `${c.name}|${c.subtitle || ''}`
const jsonParse = (v, dflt) => {
  if (v == null) return dflt
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return dflt }
}

async function main() {
  console.log(`🔍 Loading complete ${SET} draft pods...`)
  const pods = await queryRows(
    `SELECT id, share_id, all_packs FROM pods
     WHERE status = 'complete' AND set_code = $1 AND all_packs IS NOT NULL`,
    [SET]
  )
  console.log(`   ${pods.length} pods`)

  const stats = new Map() // identity -> accumulators
  const get = (c) => {
    const k = identity(c)
    if (!stats.has(k)) stats.set(k, {
      name: c.name, subtitle: c.subtitle || '', rarity: c.rarity, aspects: c.aspects || [],
      seen: 0, picked: 0, aSeen: 0, aPicked: 0, ataSum: 0, earlySeen: 0, earlyPicked: 0,
    })
    return stats.get(k)
  }

  let contests = 0, humanSeats = 0, skipped = 0
  for (let i = 0; i < pods.length; i++) {
    const pod = pods[i]
    if (i % 25 === 0) console.log(`   pod ${i + 1}/${pods.length} (contests so far: ${contests})`)
    const allPacks = jsonParse(pod.all_packs, [])
    if (!allPacks?.length) { skipped++; continue }
    const players = await queryRows(
      `SELECT seat_number, drafted_cards, drafted_leaders, is_bot
       FROM pod_players WHERE pod_id = $1 ORDER BY seat_number`,
      [pod.id]
    )
    if (!players.length) { skipped++; continue }
    const playerData = players.map(p => ({
      seatNumber: p.seat_number,
      draftedCards: jsonParse(p.drafted_cards, []),
      draftedLeaders: jsonParse(p.drafted_leaders, []),
    }))

    for (const p of players) {
      if (p.is_bot) continue
      humanSeats++
      let picks
      try {
        picks = reconstructDraftLog({
          targetSeat: p.seat_number,
          totalSeats: players.length,
          allPacks,
          players: playerData,
        })
      } catch { skipped++; continue }

      for (const pick of picks) {
        if (pick.type !== 'card' || !pick.pickedInstanceId) continue
        const visible = pick.visibleCards || []
        if (visible.length < 2) continue // last card of a pack = no contest
        const chosen = visible.find(c => c.instanceId === pick.pickedInstanceId)
        if (!chosen) continue
        contests++
        const early = pick.pickInPack <= 3

        for (const c of visible) {
          const s = get(c)
          s.seen++
          if (early) s.earlySeen++
        }
        const cs = get(chosen)
        cs.picked++
        cs.ataSum += pick.pickInPack
        if (early) cs.earlyPicked++

        // within-aspect contest: picker committed to aspect A this pick
        const A = primaryAspect(chosen)
        if (A) {
          const sameAspect = visible.filter(c => primaryAspect(c) === A)
          if (sameAspect.length >= 2) {
            for (const c of sameAspect) get(c).aSeen++
            cs.aPicked++
          }
        }
      }
    }
  }

  console.log(`\n📊 ${contests} contests from ${humanSeats} human seats (${skipped} pods/seats skipped)\n`)

  const rows = [...stats.values()]
    .filter(s => s.seen >= MIN_SEEN)
    .map(s => ({
      name: s.subtitle ? `${s.name} — ${s.subtitle}` : s.name,
      rarity: s.rarity, aspects: (s.aspects || []).join('/'),
      seen: s.seen, picked: s.picked,
      pickRate: s.picked / s.seen,
      aSeen: s.aSeen, aPicked: s.aPicked,
      aRate: s.aSeen ? s.aPicked / s.aSeen : null,
      ata: s.picked ? s.ataSum / s.picked : null,
      earlyRate: s.earlySeen ? s.earlyPicked / s.earlySeen : null,
    }))

  const fmt = (r) => `${(100 * r.pickRate).toFixed(1).padStart(5)}%  ${r.aRate == null ? '   — ' : (100 * r.aRate).toFixed(1).padStart(5) + '%'}  ${r.ata == null ? '  — ' : r.ata.toFixed(1).padStart(4)}  ${String(r.seen).padStart(5)}  ${(r.rarity || '?')[0]}  ${r.aspects.padEnd(20)} ${r.name}`
  const header = ' pick%   inAsp%   ATA   seen  R  aspects              card'

  console.log(`=== TOP ${TOP} by within-aspect pick rate (min seen ${MIN_SEEN}) ===`)
  console.log(header)
  rows.filter(r => r.aRate != null && r.aSeen >= MIN_SEEN)
    .sort((a, b) => b.aRate - a.aRate).slice(0, TOP).forEach(r => console.log(fmt(r)))

  console.log(`\n=== BOTTOM ${TOP} by within-aspect pick rate ===`)
  console.log(header)
  rows.filter(r => r.aRate != null && r.aSeen >= MIN_SEEN)
    .sort((a, b) => a.aRate - b.aRate).slice(0, TOP).forEach(r => console.log(fmt(r)))

  if (OUT) {
    writeFileSync(OUT, JSON.stringify({ set: SET, contests, humanSeats, minSeen: MIN_SEEN, cards: rows }, null, 2))
    console.log(`\n💾 Wrote ${rows.length} cards -> ${OUT}`)
  }
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
