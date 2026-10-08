// @ts-nocheck
/**
 * Card matcher service (server-only, pure).
 *
 * Maps extracted rows (from Claude vision) to RawCards in the in-app DB,
 * disambiguating same-name cards by Name|Type|Subtitle and resolving variants
 * to Normal. Imported and called by the extract route (U2).
 *
 * See docs/plans/2026-05-05-001-feat-import-pool-spike-plan.md U3.
 */

import { buildCardLookupMaps, cardIdentityKey } from '../../utils/cardNormalization'
import type { RawCard } from '../../utils/cardData'

export interface ExtractedRow {
  name: string
  type: string
  subtitle: string | null
  poolQty: number
  deckQty: number
  /** Confidence in the TOTAL column (pool qty) handwritten read. Optional for legacy callers. */
  poolQtyConfidence?: 'high' | 'medium' | 'low'
  /** Confidence in the PLAYED column (deck qty) handwritten read. Optional for legacy callers. */
  deckQtyConfidence?: 'high' | 'medium' | 'low'
}

export type MatchConfidence = 'exact' | 'high' | 'ambiguous' | 'fuzzy' | 'unmatched'

export interface MatchedRow {
  extracted: ExtractedRow
  matched: RawCard | null
  candidates: RawCard[]
  confidence: MatchConfidence
}

interface MatchInput {
  rows: ExtractedRow[]
  cards: RawCard[]
}

const FUZZY_THRESHOLD = 2

export function matchExtractedRows({ rows, cards }: MatchInput): MatchedRow[] {
  if (rows.length === 0) return []

  const { normalCardMap } = buildCardLookupMaps(cards)

  // Build secondary indices for ambiguous + fuzzy lookups, scoped to Normal variants
  // so candidates always present the canonical card to the user.
  const normalCards = cards.filter(c => c.variantType === 'Normal')
  const byNameLower = new Map<string, RawCard[]>()
  const byNameTypeLower = new Map<string, RawCard[]>()

  for (const card of normalCards) {
    const nameLower = card.name.toLowerCase()
    const nameTypeLower = `${nameLower}|${(card.type || '').toLowerCase()}`
    if (!byNameLower.has(nameLower)) byNameLower.set(nameLower, [])
    byNameLower.get(nameLower)!.push(card)
    if (!byNameTypeLower.has(nameTypeLower)) byNameTypeLower.set(nameTypeLower, [])
    byNameTypeLower.get(nameTypeLower)!.push(card)
  }

  return rows.map((row) => matchSingleRow(row, normalCardMap, byNameTypeLower, normalCards))
}

function matchSingleRow(
  row: ExtractedRow,
  normalCardMap: Map<string, RawCard>,
  byNameTypeLower: Map<string, RawCard[]>,
  normalCards: RawCard[],
): MatchedRow {
  const nameLower = row.name.toLowerCase().trim()
  const typeLower = (row.type || '').toLowerCase()
  const subtitleLower = (row.subtitle || '').toLowerCase()

  // 1. Exact match on Name|Type|Subtitle (canonical key, lowercased on both sides)
  const exactCandidates = byNameTypeLower.get(`${nameLower}|${typeLower}`) || []
  for (const candidate of exactCandidates) {
    const candidateSubtitle = (candidate.subtitle || '').toLowerCase()
    if (candidateSubtitle === subtitleLower) {
      return { extracted: row, matched: candidate, candidates: [], confidence: 'exact' }
    }
  }

  // 2. Name|Type match with subtitle absent or unparseable
  if (!row.subtitle) {
    if (exactCandidates.length === 1) {
      return { extracted: row, matched: exactCandidates[0], candidates: [], confidence: 'high' }
    }
    if (exactCandidates.length > 1) {
      return { extracted: row, matched: null, candidates: exactCandidates, confidence: 'ambiguous' }
    }
  }

  // 2b. Comma-combined name fallback. Claude sometimes returns
  //     name="Han Solo, I Got a Really Good Feeling", subtitle=null
  //     instead of separating them — especially for leaders. Split on the
  //     first ", " and re-try the exact / name+type match.
  if (!row.subtitle && nameLower.includes(', ')) {
    const idx = nameLower.indexOf(', ')
    const namePart = nameLower.slice(0, idx).trim()
    const subPart = nameLower.slice(idx + 2).trim()
    const splitCandidates = byNameTypeLower.get(`${namePart}|${typeLower}`) || []
    // Try exact subtitle match first — that's the high-confidence path.
    for (const candidate of splitCandidates) {
      const candidateSubtitle = (candidate.subtitle || '').toLowerCase()
      if (candidateSubtitle === subPart) {
        return { extracted: row, matched: candidate, candidates: [], confidence: 'high' }
      }
    }
    // No exact subtitle match, but the NAME half matched at least one card.
    // Surface as ambiguous (single hit) or with candidates (multiple hits) so
    // the user can pick — better than dropping to unmatched and forcing them
    // to start from scratch in the picker.
    if (splitCandidates.length === 1) {
      return { extracted: row, matched: splitCandidates[0], candidates: [], confidence: 'fuzzy' }
    }
    if (splitCandidates.length > 1) {
      return {
        extracted: row,
        matched: null,
        candidates: splitCandidates,
        confidence: 'ambiguous',
      }
    }
  }

  // 3. Fuzzy match on name within set, tie-broken by type
  const fuzzyCandidates: { card: RawCard; distance: number; typeMatches: boolean }[] = []
  for (const card of normalCards) {
    const distance = levenshtein(nameLower, card.name.toLowerCase())
    if (distance <= FUZZY_THRESHOLD) {
      fuzzyCandidates.push({
        card,
        distance,
        typeMatches: (card.type || '').toLowerCase() === typeLower,
      })
    }
  }
  if (fuzzyCandidates.length > 0) {
    // Sort: type-matches first, then by distance, then by name (stable)
    fuzzyCandidates.sort((a, b) => {
      if (a.typeMatches !== b.typeMatches) return a.typeMatches ? -1 : 1
      if (a.distance !== b.distance) return a.distance - b.distance
      return a.card.name.localeCompare(b.card.name)
    })
    const best = fuzzyCandidates[0]
    if (best.typeMatches || fuzzyCandidates.length === 1) {
      return { extracted: row, matched: best.card, candidates: [], confidence: 'fuzzy' }
    }
    // Multiple candidates, no type match — surface as ambiguous
    return {
      extracted: row,
      matched: null,
      candidates: fuzzyCandidates.map(c => c.card),
      confidence: 'ambiguous',
    }
  }

  // 4. No match
  return { extracted: row, matched: null, candidates: [], confidence: 'unmatched' }
}

/**
 * Levenshtein distance between two strings.
 * Standard DP implementation, O(m*n) time and space (small strings, fine).
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      )
    }
  }

  return dp[m][n]
}
