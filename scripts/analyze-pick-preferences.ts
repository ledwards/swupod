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
  const pairs = new Map() // "idA%%idB" (sorted) -> {a: wins for A, b: wins for B}
  const leaderStats = new Map() // identity -> accumulators (leader rounds)
  const leaderChoiceSets = [] // { ids: string[], chosen: string } — full PL choice sets
  const getLeader = (c) => {
    const k = identity(c)
    if (!leaderStats.has(k)) leaderStats.set(k, {
      name: c.name, subtitle: c.subtitle || '', rarity: c.rarity, aspects: c.aspects || [],
      seen: 0, picked: 0, aprSum: 0,
    })
    return leaderStats.get(k)
  }
  const get = (c) => {
    const k = identity(c)
    if (!stats.has(k)) stats.set(k, {
      name: c.name, subtitle: c.subtitle || '', rarity: c.rarity, aspects: c.aspects || [],
      seen: 0, picked: 0, aSeen: 0, aPicked: 0, ataSum: 0, earlySeen: 0, earlyPicked: 0,
    })
    return stats.get(k)
  }

  let contests = 0, leaderContests = 0, humanSeats = 0, skipped = 0
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
        if (!pick.pickedInstanceId) continue
        if (pick.type === 'leader') {
          // Leader rounds are full Plackett-Luce choice sets: the drafter chose
          // one leader from everything visible in the leader pack.
          const visible = pick.visibleCards || []
          if (visible.length < 2) continue
          const chosen = visible.find(c => c.instanceId === pick.pickedInstanceId)
          if (!chosen) continue
          leaderContests++
          for (const c of visible) getLeader(c).seen++
          const cs = getLeader(chosen)
          cs.picked++
          cs.aprSum += pick.pickInPack
          leaderChoiceSets.push({ ids: visible.map(identity), chosen: identity(chosen) })
          continue
        }
        if (pick.type !== 'card') continue
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
            // Bradley-Terry pairwise: chosen beat each same-aspect alternative
            const w = identity(chosen)
            for (const c of sameAspect) {
              const l = identity(c)
              if (l === w) continue
              const key = w < l ? `${w}%%${l}` : `${l}%%${w}`
              const rec = pairs.get(key) || { a: 0, b: 0 } // a = wins for lexicographically smaller
              if (w < l) rec.a++; else rec.b++
              pairs.set(key, rec)
            }
          }
        }
      }
    }
  }

  console.log(`\n📊 ${contests} card contests + ${leaderContests} leader contests from ${humanSeats} human seats (${skipped} pods/seats skipped)\n`)

  // Plackett-Luce fit (MM algorithm) over full leader-round choice sets:
  // s_i <- W_i / sum over sets containing i of 1 / (sum of s_j in that set).
  console.log('👑 Fitting Plackett-Luce on leader choice sets...')
  const plIds = new Set()
  for (const set of leaderChoiceSets) for (const id of set.ids) plIds.add(id)
  const plStrength = new Map([...plIds].map(id => [id, 1]))
  const plWins = new Map([...plIds].map(id => [id, 0]))
  for (const set of leaderChoiceSets) plWins.set(set.chosen, (plWins.get(set.chosen) || 0) + 1)
  for (let iter = 0; iter < 500; iter++) {
    const denom = new Map([...plIds].map(id => [id, 0]))
    for (const set of leaderChoiceSets) {
      let total = 0
      for (const id of set.ids) total += plStrength.get(id)
      if (total <= 0) continue
      const d = 1 / total
      for (const id of set.ids) denom.set(id, denom.get(id) + d)
    }
    for (const id of plIds) {
      const w = plWins.get(id) || 0
      plStrength.set(id, w > 0 ? w / Math.max(denom.get(id), 1e-9) : 1e-6)
    }
    // Normalize on the well-sampled leaders only: carbonite drafts inject
    // off-set leaders seen once or twice whose degenerate strengths would
    // otherwise dominate the geometric mean and make every number unreadable.
    // PL is scale-invariant, so this changes presentation, not fit.
    const anchorIds = [...plIds].filter(id => (leaderStats.get(id)?.seen || 0) >= MIN_SEEN)
    const normIds = anchorIds.length > 0 ? anchorIds : [...plIds]
    if (normIds.length > 0) {
      let logSum = 0; for (const id of normIds) logSum += Math.log(plStrength.get(id))
      const gm = Math.exp(logSum / normIds.length)
      for (const id of plIds) plStrength.set(id, plStrength.get(id) / gm)
    }
  }

  const leaderRows = [...leaderStats.entries()]
    .map(([k, s]) => ({
      strength: plStrength.get(k) ?? null,
      name: s.name, subtitle: s.subtitle, rarity: s.rarity, aspects: (s.aspects || []).join('/'),
      seen: s.seen, picked: s.picked,
      pickRate: s.seen ? s.picked / s.seen : null,
      apr: s.picked ? s.aprSum / s.picked : null,
    }))
    .sort((a, b) => (b.strength ?? -1) - (a.strength ?? -1))

  if (leaderRows.length > 0) {
    console.log('\n=== LEADERS by Plackett-Luce strength ===')
    console.log('    PL   pick%   APR    seen  leader')
    for (const r of leaderRows) {
      console.log(`${(r.strength ?? 0).toFixed(3).padStart(7)}  ${r.pickRate == null ? '  — ' : (100 * r.pickRate).toFixed(0).padStart(3) + '%'}  ${r.apr == null ? '  — ' : r.apr.toFixed(2).padStart(5)}  ${String(r.seen).padStart(6)}  ${r.name}${r.subtitle ? ' — ' + r.subtitle : ''}`)
    }
  }

  // Bradley-Terry fit (MM algorithm) over within-aspect pairwise contests.
  // s_i <- W_i / sum_j n_ij / (s_i + s_j); rating = percentile of log-strength.
  console.log('⚖️  Fitting Bradley-Terry on within-aspect contests...')
  const btIds = new Set()
  for (const k of pairs.keys()) { const [x, y] = k.split('%%'); btIds.add(x); btIds.add(y) }
  const strength = new Map([...btIds].map(id => [id, 1]))
  const wins = new Map([...btIds].map(id => [id, 0]))
  for (const [k, r] of pairs) {
    const [x, y] = k.split('%%')
    wins.set(x, wins.get(x) + r.a); wins.set(y, wins.get(y) + r.b)
  }
  for (let iter = 0; iter < 200; iter++) {
    const denom = new Map([...btIds].map(id => [id, 0]))
    for (const [k, r] of pairs) {
      const [x, y] = k.split('%%')
      const n = r.a + r.b
      const d = n / (strength.get(x) + strength.get(y))
      denom.set(x, denom.get(x) + d); denom.set(y, denom.get(y) + d)
    }
    for (const id of btIds) {
      const w = wins.get(id)
      strength.set(id, w > 0 ? w / Math.max(denom.get(id), 1e-9) : 1e-6)
    }
    // normalize (geometric mean = 1) for stability
    let logSum = 0; for (const id of btIds) logSum += Math.log(strength.get(id))
    const gm = Math.exp(logSum / btIds.size)
    for (const id of btIds) strength.set(id, strength.get(id) / gm)
  }
  // percentile rating 0-100 among cards with enough contests
  const eligible = [...btIds].filter(id => (stats.get(id)?.aSeen || 0) >= MIN_SEEN)
  const ranked = eligible.sort((a, b) => strength.get(a) - strength.get(b))
  const rating = new Map(ranked.map((id, i) => [id, ranked.length > 1 ? Math.round(100 * i / (ranked.length - 1)) : 50]))

  const rows = [...stats.entries()]
    .filter(([, s]) => s.seen >= MIN_SEEN)
    .map(([k, s]) => ({
      bt: strength.get(k) ?? null,
      rating: rating.get(k) ?? null,
      rawName: s.name,
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

  const EMIT = arg('emit-rankings', '')
  if (EMIT) {
    const bySet = {}
    bySet[SET] = {}
    for (const r of rows.filter(r => r.rating != null).sort((a, b) => b.rating - a.rating)) {
      // keyed by card NAME (matches POWERFUL_CARDS convention); on name
      // collisions keep the higher rating (bots score by name at pick time)
      if (!(r.rawName in bySet[SET]) || bySet[SET][r.rawName] < r.rating) bySet[SET][r.rawName] = r.rating
    }
    const ts = `// AUTO-GENERATED by scripts/analyze-pick-preferences.ts — do not hand-edit.
// Data-driven card ratings (0-100 Bradley-Terry percentile) from real human
// draft picks: within-aspect contests (chosen card vs same-primary-aspect
// alternatives visible in the pack). ${SET}: ${Object.keys(bySet[SET]).length} cards from real drafts.
// Regenerate: DATABASE_URL=<prod> npx tsx scripts/analyze-pick-preferences.ts --set=${SET} --emit-rankings=src/bots/data/cardRankings.ts

export const CARD_RANKINGS: Record<string, Record<string, number>> = ${JSON.stringify(bySet, null, 2)}
`
    writeFileSync(EMIT, ts)
    console.log(`\n🤖 Wrote card rankings -> ${EMIT}`)
  }
  // Player-facing aggregate stats (committed to src/data/pickPreferences/ —
  // aggregate card stats only, no player data). v2: adds Bradley-Terry
  // strengths per card and a Plackett-Luce leaders section, which back the
  // pick-preference tier grades on /stats and /me (pickPreferenceGrades.ts).
  const EMIT_STATS = arg('emit-stats', '')
  if (EMIT_STATS) {
    const statCards = rows
      .filter(r => r.aRate != null && r.aSeen >= MIN_SEEN)
      .sort((a, b) => (b.aRate ?? 0) - (a.aRate ?? 0))
      .map(r => ({
        name: r.rawName,
        subtitle: r.name.includes(' — ') ? r.name.split(' — ').slice(1).join(' — ') : '',
        rarity: r.rarity,
        aRate: Number((r.aRate ?? 0).toFixed(4)),
        aSeen: r.aSeen,
        rating: r.rating,
        bt: r.bt == null ? null : Number(r.bt.toFixed(4)),
        seen: r.seen,
        pickRate: Number(r.pickRate.toFixed(4)),
        ata: r.ata == null ? null : Number(r.ata.toFixed(2)),
      }))
    // Leaders are emitted regardless of MIN_SEEN — grading gates on `seen`
    // downstream, and ultra-rare leaders should surface as "insufficient
    // sample" rather than silently vanish.
    const statLeaders = leaderRows.map(r => ({
      name: r.name,
      subtitle: r.subtitle,
      rarity: r.rarity,
      strength: r.strength == null ? null : Number(r.strength.toFixed(4)),
      seen: r.seen,
      picked: r.picked,
      pickRate: r.pickRate == null ? null : Number(r.pickRate.toFixed(4)),
      apr: r.apr == null ? null : Number(r.apr.toFixed(2)),
    }))
    writeFileSync(EMIT_STATS, JSON.stringify({
      set: SET, contests, leaderContests, humanSeats, minSeen: MIN_SEEN,
      generatedAt: new Date().toISOString().slice(0, 10),
      cards: statCards,
      leaders: statLeaders,
    }, null, 2))
    console.log(`\n📈 Wrote ${statCards.length} card stats + ${statLeaders.length} leaders -> ${EMIT_STATS}`)
  }
  if (OUT) {
    writeFileSync(OUT, JSON.stringify({ set: SET, contests, leaderContests, humanSeats, minSeen: MIN_SEEN, cards: rows, leaders: leaderRows }, null, 2))
    console.log(`\n💾 Wrote ${rows.length} cards + ${leaderRows.length} leaders -> ${OUT}`)
  }
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
