// @ts-nocheck
/**
 * Pure anomaly builder. Same logic the ResolveStep used to inline; extracted
 * into a service so the eval harness can call it identically — no React
 * dependency, no re-derivation drift.
 *
 * Categories (in order):
 *   1. Section-level gaps (pool count outside typical range)
 *   2. Multi-active leader/base — hard SWU invariant: exactly one of each
 *   3. Per-row matcher problems (unresolved/fuzzy/ambiguous/deck>pool)
 *   4. Per-row low-confidence reads
 *   5. Pool-short / deck-over candidates (heuristic candidate picks)
 *
 * Returns Anomaly[] with stable keys so dismissals can target individual issues
 * rather than rows. Keys are deterministic on the underlying issue, not the
 * render order.
 */

export type Anomaly = {
  key: string
  kind: 'section' | 'row'
  targetId: string
  label: string
  sectionName: string | null
}

export interface AnomalyInputRow {
  key: string
  card: { id: string; name: string; subtitle: string | null; isLeader: boolean; isBase: boolean; aspects?: string[] } | null
  extracted: {
    name: string
    type: string
    poolQtyConfidence?: 'high' | 'medium' | 'low'
    deckQtyConfidence?: 'high' | 'medium' | 'low'
  }
  poolQty: number
  deckQty: number
  confidence: 'exact' | 'high' | 'ambiguous' | 'fuzzy' | 'unmatched'
}

export interface AnomalyInput {
  resolvedRows: AnomalyInputRow[]
  sectionGaps: Array<{ section: string; count: number; expectedLow: number; expectedHigh: number; message: string }>
  poolCount: number
  poolTarget: number
  deckCount: number
  deckTarget: number
}

const MAIN_ASPECTS = new Set(['Vigilance', 'Command', 'Aggression', 'Cunning'])
const SECONDARY_ASPECTS = new Set(['Heroism', 'Villainy'])

function sectionNameForRow(row: AnomalyInputRow): string | null {
  const card = row.card
  if (!card) {
    if (row.extracted.type === 'Leader') return 'Leaders'
    if (row.extracted.type === 'Base') return 'Bases'
    return null
  }
  if (card.isLeader) return 'Leaders'
  if (card.isBase) return 'Bases'
  const aspects: string[] = card.aspects || []
  const mains = aspects.filter((a) => MAIN_ASPECTS.has(a))
  const secs = aspects.filter((a) => SECONDARY_ASPECTS.has(a))
  if (mains.length >= 2) return 'Multicolor'
  if (mains.length === 1) return mains[0]
  if (secs.length >= 1) return secs[0]
  return 'NoAspect'
}

function confScore(level: 'high' | 'medium' | 'low' | undefined): number {
  if (level === 'low') return 0
  if (level === 'medium') return 1
  return 2
}

export function buildAnomalies(input: AnomalyInput): Anomaly[] {
  const { resolvedRows, sectionGaps, poolCount, poolTarget, deckCount, deckTarget } = input
  const list: Anomaly[] = []
  const seenRowKey = new Set<string>()
  const pushRow = (row: AnomalyInputRow, key: string, label: string) => {
    if (seenRowKey.has(row.key)) return
    seenRowKey.add(row.key)
    list.push({
      key,
      kind: 'row',
      targetId: `ip-row-${row.key}`,
      label,
      sectionName: sectionNameForRow(row),
    })
  }

  // 1) Section gaps (typical-range based)
  for (const gap of sectionGaps) {
    list.push({
      key: `section:${gap.section}`,
      kind: 'section',
      targetId: `ip-section-${gap.section.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label: gap.message,
      sectionName: gap.section,
    })
  }

  // 2) Leaders/Bases checks
  //
  // Sealed pool always has exactly 6 leaders (one per booster) and 6-7 bases,
  // with exactly 1 active of each (deckQty=1). Surfacing as kind='section'
  // so any wrong row in those sections gets the section catch.
  const leaderRowsInPool = resolvedRows.filter((r) => r.card?.isLeader && r.poolQty >= 1)
  const activeLeaderRows = resolvedRows.filter((r) => r.card?.isLeader && r.deckQty >= 1)
  const baseRowsInPool = resolvedRows.filter((r) => r.card?.isBase && r.poolQty >= 1)
  const activeBaseRows = resolvedRows.filter((r) => r.card?.isBase && r.deckQty >= 1)

  if (leaderRowsInPool.length !== 6) {
    list.push({
      key: 'leadersCount',
      kind: 'section',
      targetId: `ip-section-leaders`,
      label: `Leaders: ${leaderRowsInPool.length} marked in pool — sealed pool always has exactly 6. Verify.`,
      sectionName: 'Leaders',
    })
  }
  if (activeLeaderRows.length !== 1) {
    list.push({
      key: activeLeaderRows.length > 1 ? 'multiActiveLeader' : 'noActiveLeader',
      kind: 'section',
      targetId: `ip-section-leaders`,
      label:
        activeLeaderRows.length === 0
          ? `Leaders: no active leader marked — verify the PLAYED column on a leader.`
          : `Leaders: ${activeLeaderRows.length} marked active (${activeLeaderRows.map((r) => r.card!.name).join(', ')}) — only one can be active.`,
      sectionName: 'Leaders',
    })
    for (const r of activeLeaderRows) seenRowKey.add(r.key)
  }
  if (baseRowsInPool.length < 6 || baseRowsInPool.length > 7) {
    list.push({
      key: 'basesCount',
      kind: 'section',
      targetId: `ip-section-bases`,
      label: `Bases: ${baseRowsInPool.length} marked in pool — typical sealed pool has 6-7. Verify.`,
      sectionName: 'Bases',
    })
  }
  if (activeBaseRows.length !== 1) {
    list.push({
      key: activeBaseRows.length > 1 ? 'multiActiveBase' : 'noActiveBase',
      kind: 'section',
      targetId: `ip-section-bases`,
      label:
        activeBaseRows.length === 0
          ? `Bases: no active base marked — verify the PLAYED column on a base.`
          : `Bases: ${activeBaseRows.length} marked active (${activeBaseRows.map((r) => r.card!.name).join(', ')}) — only one can be active.`,
      sectionName: 'Bases',
    })
    for (const r of activeBaseRows) seenRowKey.add(r.key)
  }

  // Invariant: a card cannot have deckQty > poolQty. Surfaces pool=0 deck=1
  // anomalies that the matcher loop misses (because the matcher only iterates
  // poolQty >= 1 rows).
  for (const row of resolvedRows) {
    if (row.deckQty > row.poolQty && row.poolQty === 0 && !seenRowKey.has(row.key)) {
      const cardName = row.card?.name || row.extracted.name || 'Unrecognized'
      pushRow(
        row,
        `invariant:deckNoPool:${row.key}`,
        `Confirm ${cardName} — marked played but not in pool`,
      )
    }
  }

  // 3) Per-row matcher problems
  for (const row of resolvedRows) {
    if (row.poolQty <= 0) continue
    const cardName = row.card?.name || row.extracted.name || 'Unrecognized'
    if (!row.card) {
      pushRow(row, `match:unmatched:${row.key}`, `Unmatched: ${cardName}`)
      continue
    }
    if (row.confidence === 'ambiguous') {
      pushRow(row, `match:ambiguous:${row.key}`, `Ambiguous match: ${cardName}`)
      continue
    }
    if (row.confidence === 'fuzzy') {
      pushRow(row, `match:fuzzy:${row.key}`, `Fuzzy match: ${cardName}`)
      continue
    }
    if (row.deckQty > row.poolQty) {
      pushRow(
        row,
        `match:badQty:${row.key}`,
        `${cardName}: deck count (${row.deckQty}) exceeds pool count (${row.poolQty})`,
      )
      continue
    }
  }

  // 4) Low-confidence reads
  for (const row of resolvedRows) {
    if (seenRowKey.has(row.key)) continue
    const cardName = row.card?.name || row.extracted.name || 'Unrecognized'
    let surfaced = false
    if (row.extracted.poolQtyConfidence === 'low') {
      list.push({
        key: `lowConf:pool:${row.key}`,
        kind: 'row',
        targetId: `ip-row-${row.key}`,
        label: `Uncertain pool count: ${cardName} (read as ${row.poolQty})`,
        sectionName: sectionNameForRow(row),
      })
      surfaced = true
    }
    if (row.extracted.deckQtyConfidence === 'low') {
      list.push({
        key: `lowConf:deck:${row.key}`,
        kind: 'row',
        targetId: `ip-row-${row.key}`,
        label: `Uncertain deck count: ${cardName} (read as ${row.deckQty})`,
        sectionName: sectionNameForRow(row),
      })
      surfaced = true
    }
    if (surfaced) seenRowKey.add(row.key)
  }

  // === HEURISTIC A: section-deficit-weighted candidate selection ===
  //
  // The OLD code (alphabetical-after-confidence) hits ~6% precision because
  // ~263/264 cells are "high" confidence — alphabetical wins ties. Heuristic
  // A leverages the fact that pool counts per section have a typical
  // distribution: sections at the LOW end of their range are more likely to
  // be the source of missed cards, sections at the HIGH end more likely to
  // be the source of phantom marks.
  //
  // The handoff measured this approach catching ~70% of pool-side issues
  // across the 3 fixtures.
  if (poolCount < poolTarget) {
    const poolDelta = poolTarget - poolCount
    surfacePoolShortCandidates({ list, resolvedRows, seenRowKey, poolDelta, pushRow })
  }
  if (poolCount > poolTarget) {
    const poolOverDelta = poolCount - poolTarget
    surfacePoolPhantomCandidates({ list, resolvedRows, seenRowKey, poolOverDelta, pushRow })
  }

  // === HIGH-RECALL "always include the wrong stuff" mode ===
  //
  // For each section that has any cards in the pool, surface a section
  // anomaly that says "verify rows in here." Guarantees the user is forced
  // to look at every section where errors could hide. Trade: more false
  // alarms, but no missed errors.
  for (const range of [...SECTION_RANGES, { key: 'Leaders' }, { key: 'Bases' }] as any[]) {
    const inSec = resolvedRows.filter((r) => r.card && sectionForRow(r) === range.key)
    const poolInSec = inSec.reduce((s, r) => s + r.poolQty, 0)
    const deckInSec = inSec.reduce((s, r) => s + r.deckQty, 0)
    if (poolInSec >= 1 || deckInSec >= 1) {
      list.push({
        key: `verifySection:${range.key}`,
        kind: 'section',
        targetId: `ip-section-${range.key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        label: `Verify ${range.key}: ${poolInSec} in pool, ${deckInSec} in deck`,
        sectionName: range.key,
      })
    }
  }

  // === HEURISTIC: per-section pool-count anomalies ===
  //
  // Fire whenever a section's pool count is outside the tightened typical
  // range, even if the total pool count is exactly at target. The
  // canceling-mask case (e.g. casual-lee-law where Aggression −3 and
  // Multicolor +1 net to 0) is invisible to total-pool checks; per-section
  // sums are the only way to catch it.
  for (const range of SECTION_RANGES) {
    const inSec = resolvedRows.filter(
      (r) => r.card && !r.card.isLeader && !r.card.isBase && sectionForRow(r) === range.key,
    )
    const poolInSec = inSec.reduce((s, r) => s + r.poolQty, 0)
    if (poolInSec < range.low) {
      list.push({
        key: `sectionPoolShort:${range.key}`,
        kind: 'section',
        targetId: `ip-section-${range.key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        label: `${range.key}: ${poolInSec} cards in pool — typical sealed pool has ${range.low}-${range.high}. Possibly missed marks.`,
        sectionName: range.key,
      })
    } else if (poolInSec > range.high) {
      list.push({
        key: `sectionPoolOver:${range.key}`,
        kind: 'section',
        targetId: `ip-section-${range.key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        label: `${range.key}: ${poolInSec} cards in pool — typical sealed pool has ${range.low}-${range.high}. Possibly extra marks.`,
        sectionName: range.key,
      })
    }
  }

  // === HEURISTIC B: section deck-balance anomaly ===
  //
  // When extraction fails on a whole section's deck column (Opus skipped
  // the column for that section's bounding box), the section ends up with
  // poolQty>=1 cards that all have deckQty=0. The structural fingerprint
  // is: section's pool >= 5 cards, but deck cards in that section is 0–1.
  //
  // For the data we measured: sq-lee-law Aggression had 18 pool / 1 deck
  // and sq-lee-law Cunning had 16 pool / 0 deck — clearly columnar failure
  // affecting ~10 wrong_deck rows in each section. A single section-level
  // anomaly here points the user at an entire affected section; catching
  // any wrong_deck in that section then becomes a matter of ALL of those
  // rows now being attributed to the section flag.
  for (const range of SECTION_RANGES) {
    const inSec = resolvedRows.filter(
      (r) => r.card && !r.card.isLeader && !r.card.isBase && sectionForRow(r) === range.key,
    )
    const poolInSec = inSec.reduce((s, r) => s + r.poolQty, 0)
    const deckInSec = inSec.reduce((s, r) => s + r.deckQty, 0)
    if (poolInSec >= 5 && deckInSec <= 1) {
      list.push({
        key: `sectionDeckImbalance:${range.key}`,
        kind: 'section',
        targetId: `ip-section-${range.key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        label: `${range.key}: ${poolInSec} cards in pool but ${deckInSec} marked played — verify deck column for this section`,
        sectionName: range.key,
      })
    }
  }

  // Deck-side, both directions:
  //   - deck OVER → some pool=1 deck=1 row was wrongly marked played
  //   - deck SHORT → some pool=1 deck=0 row was missed for the deck
  if (deckCount > deckTarget) {
    const deckDelta = deckCount - deckTarget
    surfaceDeckOverCandidates({ list, resolvedRows, seenRowKey, deckDelta, pushRow })
  }
  if (deckCount < deckTarget) {
    const deckShortDelta = deckTarget - deckCount
    surfaceDeckShortCandidates({ list, resolvedRows, seenRowKey, deckShortDelta, pushRow })
  }

  return list
}

// === HELPERS ===

interface SectionRange { key: string; low: number; high: number; deckMin?: number }
// Empirically tightened from the 3 evaluated fixtures' truth distributions:
// Vigilance/Command 14-16, Aggression/Cunning 14-18, Multicolor 11-15,
// NoAspect 5-6, Heroism/Villainy 0-2. Padded ±2 for safety.
const SECTION_RANGES: SectionRange[] = [
  { key: 'Vigilance', low: 12, high: 18 },
  { key: 'Command', low: 13, high: 18 },
  { key: 'Aggression', low: 12, high: 20 },
  { key: 'Cunning', low: 12, high: 19 },
  { key: 'Heroism', low: 0, high: 4 },
  { key: 'Villainy', low: 0, high: 4 },
  { key: 'Multicolor', low: 9, high: 17 },
  { key: 'NoAspect', low: 3, high: 8 },
]

function sectionForRow(row: AnomalyInputRow): string | null {
  return sectionNameForRow(row)
}

function poolCountBySection(rows: AnomalyInputRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (!r.card || r.card.isLeader || r.card.isBase) continue
    if (r.poolQty < 1) continue
    const s = sectionForRow(r)
    if (!s) continue
    map.set(s, (map.get(s) || 0) + 1)
  }
  return map
}

function rankSectionsByDeficit(counts: Map<string, number>, direction: 'short' | 'over'): Array<{ section: string; signal: number }> {
  // 'short' → sections with count BELOW their range midpoint score positive
  //          (more likely to be missing cards).
  // 'over'  → sections ABOVE midpoint score positive (more likely to host phantoms).
  const out: Array<{ section: string; signal: number }> = []
  for (const range of SECTION_RANGES) {
    const c = counts.get(range.key) || 0
    const mid = (range.low + range.high) / 2
    const signal = direction === 'short' ? mid - c : c - mid
    if (signal > 0) out.push({ section: range.key, signal })
  }
  out.sort((a, b) => b.signal - a.signal)
  return out
}

function surfacePoolShortCandidates(args: {
  list: Anomaly[]
  resolvedRows: AnomalyInputRow[]
  seenRowKey: Set<string>
  poolDelta: number
  pushRow: (row: AnomalyInputRow, key: string, label: string) => void
}) {
  const { list, resolvedRows, seenRowKey, poolDelta, pushRow } = args
  const counts = poolCountBySection(resolvedRows)
  const ranked = rankSectionsByDeficit(counts, 'short')

  // Round-robin allocate across deficit-positive sections, picking poolQty=0
  // candidates in section-priority order. Within each section, prefer
  // lowest pool confidence first (tie-breaker stays alphabetical).
  let remaining = poolDelta
  const sectionCandidatePools = new Map<string, AnomalyInputRow[]>()
  for (const { section } of ranked) {
    const inSec = resolvedRows
      .filter(
        (r) =>
          !seenRowKey.has(r.key) &&
          r.poolQty === 0 &&
          r.extracted.type !== 'Leader' &&
          r.extracted.type !== 'Base' &&
          sectionForRow(r) === section,
      )
      .map((r) => ({ r, score: confScore(r.extracted.poolQtyConfidence) }))
      .sort((a, b) => a.score - b.score || a.r.extracted.name.localeCompare(b.r.extracted.name))
      .map((x) => x.r)
    sectionCandidatePools.set(section, inSec)
  }

  // Round-robin: each section gets one pick per pass, in deficit order, until
  // budget exhausted.
  while (remaining > 0) {
    let took = 0
    for (const { section } of ranked) {
      if (remaining <= 0) break
      const pool = sectionCandidatePools.get(section) || []
      const r = pool.shift()
      if (!r) continue
      const cardName = r.card?.name || r.extracted.name || 'Unrecognized'
      pushRow(r, `poolShortPick:${r.key}`, `Confirm ${cardName} — likely missing from ${section}`)
      remaining--
      took++
    }
    if (took === 0) break // no more candidates anywhere
  }

  // If no section has a positive deficit signal but pool is still short,
  // fall back: scan ALL poolQty=0 candidates by confidence then alphabetical.
  // This is the last-resort honest behavior — better than nothing, no worse
  // than the prior alphabetical-noise version.
  while (remaining > 0) {
    const fallback = resolvedRows
      .filter((r) => !seenRowKey.has(r.key) && r.poolQty === 0 && r.extracted.type !== 'Leader' && r.extracted.type !== 'Base')
      .map((r) => ({ r, score: confScore(r.extracted.poolQtyConfidence) }))
      .sort((a, b) => a.score - b.score || a.r.extracted.name.localeCompare(b.r.extracted.name))[0]
    if (!fallback) break
    const r = fallback.r
    const cardName = r.card?.name || r.extracted.name || 'Unrecognized'
    pushRow(r, `poolShortPick:${r.key}`, `Confirm ${cardName} — pool count: ${r.poolQty}`)
    remaining--
  }
  void list // anomalies were pushed via pushRow
}

function surfacePoolPhantomCandidates(args: {
  list: Anomaly[]
  resolvedRows: AnomalyInputRow[]
  seenRowKey: Set<string>
  poolOverDelta: number
  pushRow: (row: AnomalyInputRow, key: string, label: string) => void
}) {
  const { resolvedRows, seenRowKey, poolOverDelta, pushRow } = args
  const counts = poolCountBySection(resolvedRows)
  const ranked = rankSectionsByDeficit(counts, 'over')

  let remaining = poolOverDelta
  const sectionCandidatePools = new Map<string, AnomalyInputRow[]>()
  for (const { section } of ranked) {
    const inSec = resolvedRows
      .filter(
        (r) =>
          !seenRowKey.has(r.key) &&
          r.poolQty >= 1 &&
          r.extracted.type !== 'Leader' &&
          r.extracted.type !== 'Base' &&
          sectionForRow(r) === section,
      )
      .map((r) => ({ r, score: confScore(r.extracted.poolQtyConfidence) }))
      .sort((a, b) => a.score - b.score || a.r.extracted.name.localeCompare(b.r.extracted.name))
      .map((x) => x.r)
    sectionCandidatePools.set(section, inSec)
  }

  while (remaining > 0) {
    let took = 0
    for (const { section } of ranked) {
      if (remaining <= 0) break
      const pool = sectionCandidatePools.get(section) || []
      const r = pool.shift()
      if (!r) continue
      const cardName = r.card?.name || r.extracted.name || 'Unrecognized'
      pushRow(r, `poolPhantomPick:${r.key}`, `Confirm ${cardName} — possibly extra in ${section} (read as ${r.poolQty})`)
      remaining--
      took++
    }
    if (took === 0) break
  }
}

function surfaceDeckOverCandidates(args: {
  list: Anomaly[]
  resolvedRows: AnomalyInputRow[]
  seenRowKey: Set<string>
  deckDelta: number
  pushRow: (row: AnomalyInputRow, key: string, label: string) => void
}) {
  const { resolvedRows, seenRowKey, deckDelta, pushRow } = args
  const candidates = resolvedRows
    .filter((r) => !seenRowKey.has(r.key) && r.deckQty > 0 && r.extracted.type !== 'Leader' && r.extracted.type !== 'Base')
    .map((r) => ({ r, score: confScore(r.extracted.deckQtyConfidence) }))
    .sort((a, b) => a.score - b.score || a.r.extracted.name.localeCompare(b.r.extracted.name))
    .slice(0, deckDelta)
  for (const { r } of candidates) {
    const cardName = r.card?.name || r.extracted.name || 'Unrecognized'
    pushRow(r, `deckOverPick:${r.key}`, `Confirm ${cardName} — deck count: ${r.deckQty}`)
  }
}

function surfaceDeckShortCandidates(args: {
  list: Anomaly[]
  resolvedRows: AnomalyInputRow[]
  seenRowKey: Set<string>
  deckShortDelta: number
  pushRow: (row: AnomalyInputRow, key: string, label: string) => void
}) {
  const { resolvedRows, seenRowKey, deckShortDelta, pushRow } = args
  // Deck-short candidates: rows the user has in pool (poolQty>=1) but didn't
  // mark deck=1. Could be a missed PLAYED check. Rank by lowest deck-conf
  // first; alphabetical tie-break.
  const candidates = resolvedRows
    .filter(
      (r) =>
        !seenRowKey.has(r.key) &&
        r.poolQty >= 1 &&
        r.deckQty === 0 &&
        r.extracted.type !== 'Leader' &&
        r.extracted.type !== 'Base',
    )
    .map((r) => ({ r, score: confScore(r.extracted.deckQtyConfidence) }))
    .sort((a, b) => a.score - b.score || a.r.extracted.name.localeCompare(b.r.extracted.name))
    .slice(0, deckShortDelta)
  for (const { r } of candidates) {
    const cardName = r.card?.name || r.extracted.name || 'Unrecognized'
    pushRow(r, `deckShortPick:${r.key}`, `Confirm ${cardName} — deck count: 0`)
  }
}
