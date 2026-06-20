// @ts-nocheck
// GET /api/stats/me/luck — Authenticated user's per-set luck analysis.
//
// Returns the rarity, aspect, and per-card streak data used by the Luck
// Section in the new "You" tab on /stats (plan U6). Composes:
//   - src/services/expectedDistribution.ts (per-pack expected baselines)
//   - src/services/luckVerdict.ts          (regime + p-value + copy)
//
// SCOPE TOGGLE
// =============
// Two scopes match the brainstorm's two questions:
//   scope=opened  ("packs I personally cracked, regardless of who picked")
//                 Sealed half: pools the user owns (card_pools.user_id).
//                 Draft  half: per-pod seat-based attribution. The seat
//                              that cracked a given pack is derived from
//                              card_generations.pack_index via
//                              src/utils/packOpenerSeat — STANDARD mode
//                              uses floor(pack_index / packsPerPlayer);
//                              CHAOS mode uses pack_index % 8 (the
//                              generator's hardcoded packs-per-set-group).
//   scope=kept    ("what I drafted")
//                 Uniform across formats now that U9 backfills
//                 card_generations.user_id on the draft pick path.
//
// SQL NOTES
// ==========
// pods.packs_per_player does NOT exist as a column. The draft start
// route derives it from `pod.settings.chaosSets?.length || 3`. We mirror
// that with COALESCE(jsonb_array_length(p.settings->'chaosSets'), 3).
//
// pods has no is_chaos column either. Chaos is detected via
// `settings.draftMode = 'chaos'`. Both branches of the seat predicate
// (standard and chaos) are present in a single SQL — Postgres short-
// circuits the OR so each row only evaluates the branch that applies.
//
// The chaos branch uses literal `% 8` because the box generator
// (src/utils/draftLogic.ts) hardcodes 8 packs per selected set group
// regardless of player count. The packOpenerSeat helper exports
// CHAOS_PACKS_PER_SET_GROUP as the single source of truth for that
// constant; the SQL re-states it inline because parameterizing every
// integer literal would obscure the math.
//
// The pod_players JOIN clause INCLUDES `pp.user_id = $authUserId AND
// pp.is_bot = false` (not just on the outer WHERE). Without this, the
// seat predicate alone could match a bot row that happens to be at the
// same seat in some other pod — an adversarial-config edge case the plan
// flagged as load-bearing.
//
// PRIVACY
// =======
// The `streaks` array contains per-card pull history. Must NEVER be
// exposed in any shareable view without an explicit privacy decision.
// Cache headers (private + Vary: Cookie) defend against edge mis-caching.
//
// Pattern mirrors app/api/stats/me/summary/route.ts (U5):
//   - applyRateLimit at entry (60 req/min/IP)
//   - requireAuth via session cookie / Bearer token
//   - Cache-Control: private, max-age=60  + Vary: Cookie

import { queryRow, queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { NextRequest, NextResponse } from 'next/server'
import {
  getExpectedPerPack,
  scaleExpected,
  classifyAspect,
  ASPECT_CATEGORIES,
  RARITIES,
  type AspectCategory,
  type ExpectedRarity,
} from '@/src/services/expectedDistribution'
import {
  verdict,
  isInterestingStreak,
  type LuckRegime,
  type LuckVerdict,
} from '@/src/services/luckVerdict'
import { getAllCards } from '@/src/utils/cardData'
import { getSetConfig } from '@/src/utils/setConfigs'
// Per-set duplicate-rate model (see docs/research/duplicate-rate-analysis.md and
// the Duplicates tab on /qa). The definitive expected-duplicates-per-pool: a
// sealed 6-pack pool runs ~4–6.7 duplicates, NOT zero — every pull of a card you
// already opened (almost always its foil/hyperspace printing) is a duplicate.
import duplicateStats from '@/src/data/duplicateStats.json'

const DEFAULT_SINCE = '2020-01-01'
const DEFAULT_UNTIL = '2099-12-31'
const VALID_SCOPES = ['opened', 'kept'] as const
type Scope = (typeof VALID_SCOPES)[number]

// Max streaks returned per request; the UI offers a "show all" expander
// for hasMore=true cases. 10 is the brainstorm's chosen cap.
const STREAKS_CAP = 10

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// Tight enough to keep an attacker from injecting noise; loose enough to
// pass every real set code (SOR, SHD, TWI, JTL, LOF, SEC, LAW, ASH...) and
// the documented Carbonite variants (LAW-CB).
const SET_CODE_RE = /^[A-Z]{3}(?:-CB)?$/

/**
 * Parse a YYYY-MM-DD query param. Returns null on empty input (so caller
 * uses the default). Throws on malformed strings — mirrors U5's helper for
 * consistency.
 */
export function parseDateParam(raw: string | null): string | null {
  if (raw == null || raw === '') return null
  const trimmed = raw.trim()
  if (!DATE_RE.test(trimmed)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD.')
  }
  const ts = Date.parse(trimmed + 'T00:00:00Z')
  if (Number.isNaN(ts)) {
    throw new Error('Invalid date value.')
  }
  return trimmed
}

/**
 * Validate the scope query param.
 *
 * Returns the validated scope or null for empty input (so caller falls back
 * to `opened`). Throws on any value that isn't `opened` or `kept`.
 */
export function parseScopeParam(raw: string | null): Scope | null {
  if (raw == null || raw === '') return null
  const trimmed = raw.trim()
  if ((VALID_SCOPES as readonly string[]).includes(trimmed)) {
    return trimmed as Scope
  }
  throw new Error(
    `Invalid scope. Expected one of: ${VALID_SCOPES.join(', ')}.`,
  )
}

/**
 * Validate the setCode query param. Required; returns the trimmed value or
 * throws.
 */
export function parseSetCodeParam(raw: string | null): string {
  if (raw == null) {
    throw new Error('Missing required parameter: setCode')
  }
  const trimmed = raw.trim()
  if (trimmed === '') {
    throw new Error('Missing required parameter: setCode')
  }
  if (!SET_CODE_RE.test(trimmed)) {
    throw new Error('Invalid setCode format.')
  }
  return trimmed
}

// ---------------------------------------------------------------------------
// Row aggregation (pure)
// ---------------------------------------------------------------------------

/**
 * A row as returned by the SQL: one card pulled in a pack, including the
 * pack-index identity needed to derive packsCracked = distinct
 * (source_id, pack_index) pairs.
 */
export interface GenerationRow {
  card_id: string
  card_name?: string | null
  rarity: string
  aspects: string[] | null
  pack_index: number
  source_id: string
  // Present on the user's own queries (not the platform aggregate); used by
  // the duplicate-rate and showcase-rate widgets. Defaults treat a missing
  // value as a normal base pull.
  treatment?: string | null
  is_showcase?: boolean | null
}

export interface ObservedAggregate {
  packsCracked: number
  rarity: Record<ExpectedRarity, number>
  aspect: Record<AspectCategory, number>
  perCard: Map<string, number>
}

function emptyRarity(): Record<ExpectedRarity, number> {
  const out: Record<string, number> = {}
  for (const r of RARITIES) out[r] = 0
  return out as Record<ExpectedRarity, number>
}

function emptyAspect(): Record<AspectCategory, number> {
  const out: Record<string, number> = {}
  for (const a of ASPECT_CATEGORIES) out[a] = 0
  return out as Record<AspectCategory, number>
}

/**
 * Aggregate raw generation rows into observed counts.
 *
 * Pure — no DB, no React. Mirrors the U3 classifier exactly so observed
 * aspect categories line up bucket-for-bucket with expected.
 *
 * `packsCracked` counts the unique (source_id, pack_index) pairs across all
 * rows. This is what gets passed into `scaleExpected` and into `verdict`
 * as `n`. NOTE: distinct packs across both sealed pools and draft pods.
 */
export function aggregateObserved(rows: GenerationRow[]): ObservedAggregate {
  const rarity = emptyRarity()
  const aspect = emptyAspect()
  const perCard = new Map<string, number>()
  const packs = new Set<string>()

  for (const row of rows) {
    // pack-uniqueness key: source_id + pack_index. Stringify pack_index
    // defensively in case the driver returns it as a number or string.
    packs.add(`${row.source_id}#${row.pack_index}`)

    // Rarity — only bucket the four spec-tracked categories. Anything else
    // (legacy 'Special', null) doesn't show up in the observed map; it
    // would also be absent from expected so the comparison stays honest.
    if ((RARITIES as readonly string[]).includes(row.rarity)) {
      rarity[row.rarity as ExpectedRarity] += 1
    }

    // Aspect — classify exactly the same way expectedDistribution does so
    // categories align (Vigilance/Command/Aggression/Cunning mono, Neutral
    // for 0 colors, Multicolor for 2+ colors).
    const aspectCat = classifyAspect({ aspects: row.aspects ?? [] })
    aspect[aspectCat] += 1

    // Per-card observed count for streak detection.
    if (row.card_id) {
      perCard.set(row.card_id, (perCard.get(row.card_id) ?? 0) + 1)
    }
  }

  return {
    packsCracked: packs.size,
    rarity,
    aspect,
    perCard,
  }
}

// ---------------------------------------------------------------------------
// Verdict assembly (pure)
// ---------------------------------------------------------------------------

/**
 * The worst regime across a set of per-bucket regimes, with the convention:
 *   'unusual' > 'insufficient' > 'normal'
 *
 * 'insufficient' beats 'normal' because if any single bucket lacks the
 * sample size to call, it's misleading to claim the whole dimension is
 * normal — but 'unusual' still wins overall (one tail event is the
 * headline the user wants to see).
 *
 * Mirrors the plan's "headlineRegime = worst regime" requirement.
 */
function worstRegime(regimes: LuckRegime[]): LuckRegime {
  if (regimes.some((r) => r === 'unusual')) return 'unusual'
  if (regimes.some((r) => r === 'insufficient')) return 'insufficient'
  return 'normal'
}

/**
 * Pick the headline copy for a multi-bucket dimension.
 *
 * Strategy:
 *   1. If the worst regime is `unusual`, headline = the copy of the bucket
 *      with the smallest p-value (the most surprising single bucket).
 *   2. If the worst regime is `insufficient`, headline = the first
 *      bucket's `insufficient` copy (they're all the same template).
 *   3. Otherwise (`normal`), headline = the first bucket's `normal` copy.
 *
 * Returns the chosen bucket name as well so the UI can render "Your
 * Vigilance share is..." with the correct label.
 *
 * Naming the driver in the copy:
 *   luckVerdict's `verdict()` doesn't expose a `label` field on its input,
 *   so the per-bucket copy never names a specific aspect or rarity. The
 *   plan calls for "Your Vigilance share is..." — i.e. the headline must
 *   name the driving bucket. We post-process the copy template here to
 *   substitute the generic "One of your aspects" with the labelled form.
 *   This keeps the luckVerdict service unchanged; the U6 route owns the
 *   "which aspect drove the verdict" framing.
 */
function pickHeadline(
  buckets: Array<{ label: string; verdict: LuckVerdict }>,
): { regime: LuckRegime; copy: string; label: string } {
  if (buckets.length === 0) {
    return { regime: 'insufficient', copy: '', label: '' }
  }
  const regime = worstRegime(buckets.map((b) => b.verdict.regime))
  if (regime === 'unusual') {
    // Smallest p-value (most surprising single bucket).
    const driver = buckets
      .filter((b) => b.verdict.regime === 'unusual')
      .sort(
        (a, b) =>
          (Number.isFinite(a.verdict.pValue) ? a.verdict.pValue : 1) -
          (Number.isFinite(b.verdict.pValue) ? b.verdict.pValue : 1),
      )[0]
    // Substitute the labelled form. The aspect "unusual" template starts
    // with "One of your aspects is meaningfully..." — we swap in the
    // specific aspect name so the UI doesn't have to render two copies.
    const labelledCopy = driver.verdict.copy.replace(
      /One of your aspects/g,
      `Your ${driver.label} share`,
    )
    return { regime, copy: labelledCopy, label: driver.label }
  }
  // Insufficient / normal: copy is identical across buckets per
  // luckVerdict.ts templates, so any bucket's copy will do.
  return {
    regime,
    copy: buckets[0].verdict.copy,
    label: buckets[0].label,
  }
}

/**
 * Build the rarity panel of the response. Each rarity bucket gets its own
 * verdict; the headline is the worst of the four.
 */
export function buildRarityPanel(
  observed: Record<ExpectedRarity, number>,
  expected: Record<ExpectedRarity, number>,
  packsCracked: number,
  platformActual: Record<ExpectedRarity, number> = emptyRarity(),
  platformPacksCracked = 0,
) {
  const perRarity: Record<ExpectedRarity, LuckVerdict> = {} as Record<
    ExpectedRarity,
    LuckVerdict
  >
  for (const rarity of RARITIES) {
    perRarity[rarity] = verdict({
      observed: observed[rarity],
      expected: expected[rarity],
      n: packsCracked,
      dimension: 'rarity',
    })
  }
  const buckets = RARITIES.map((r) => ({
    label: r as string,
    verdict: perRarity[r],
  }))
  const headline = pickHeadline(buckets)
  return {
    observed,
    expected,
    platformActual,
    platformPacksCracked,
    perRarity,
    headlineRegime: headline.regime,
    headlineCopy: headline.copy,
    headlineLabel: headline.label,
  }
}

/**
 * Build the aspect panel of the response. Each aspect gets its own
 * verdict; the headline is driven by the most surprising single aspect.
 */
export function buildAspectPanel(
  observed: Record<AspectCategory, number>,
  expected: Record<AspectCategory, number>,
  packsCracked: number,
  platformActual: Record<AspectCategory, number> = emptyAspect(),
  platformPacksCracked = 0,
) {
  const perAspect: Record<AspectCategory, LuckVerdict> = {} as Record<
    AspectCategory,
    LuckVerdict
  >
  for (const aspect of ASPECT_CATEGORIES) {
    perAspect[aspect] = verdict({
      observed: observed[aspect],
      expected: expected[aspect],
      n: packsCracked,
      dimension: 'aspect',
    })
  }
  const buckets = ASPECT_CATEGORIES.map((a) => ({
    label: a as string,
    verdict: perAspect[a],
  }))
  const headline = pickHeadline(buckets)
  return {
    observed,
    expected,
    platformActual,
    platformPacksCracked,
    perAspect,
    headlineRegime: headline.regime,
    headlineCopy: headline.copy,
    headlineLabel: headline.label,
  }
}

/**
 * Build the streaks list.
 *
 * Iterates the expected per-card Map (NOT observed) so that cards the user
 * has NEVER pulled but the spec predicts they should have — a low-count
 * tail event — can still appear. Each candidate is filtered via
 * `isInterestingStreak`; passing entries get the streak copy from
 * `verdict({dimension: 'streaks'})`. Sorted by p-value asc; capped at
 * STREAKS_CAP with hasMore flag set when more qualified.
 */
export function buildStreaks(
  perCardObserved: Map<string, number>,
  perCardExpected: Map<string, number>,
  packsCracked: number,
  nameLookup: (cardId: string) => string,
): {
  streaks: Array<{
    cardId: string
    cardName: string
    observed: number
    expected: number
    pValue: number
    copy: string
  }>
  hasMore: boolean
} {
  const interesting: Array<{
    cardId: string
    cardName: string
    observed: number
    expected: number
    pValue: number
    copy: string
  }> = []

  for (const [cardId, expectedRate] of perCardExpected) {
    const observed = perCardObserved.get(cardId) ?? 0
    if (
      !isInterestingStreak({
        observed,
        expected: expectedRate,
        n: packsCracked,
      })
    ) {
      continue
    }
    const v = verdict({
      observed,
      expected: expectedRate,
      n: packsCracked,
      dimension: 'streaks',
    })
    interesting.push({
      cardId,
      cardName: nameLookup(cardId),
      observed,
      expected: expectedRate,
      pValue: v.pValue,
      copy: v.copy,
    })
  }

  interesting.sort((a, b) => {
    const aP = Number.isFinite(a.pValue) ? a.pValue : 1
    const bP = Number.isFinite(b.pValue) ? b.pValue : 1
    return aP - bP
  })

  if (interesting.length > STREAKS_CAP) {
    return {
      streaks: interesting.slice(0, STREAKS_CAP),
      hasMore: true,
    }
  }
  return { streaks: interesting, hasMore: false }
}

/**
 * Build the empty / no-activity response. Same shape as the populated
 * response but with packsCracked=0 and every dimension in `insufficient`.
 * Centralised so the empty path can't drift from the populated path.
 */
export function buildEmptyResponse(setCode: string, scope: Scope) {
  // verdict() with n=0 always lands in `insufficient` regardless of the
  // observed/expected pair, which matches the plan's expectation.
  return {
    setCode,
    scope,
    packsCracked: 0,
    rarity: buildRarityPanel(emptyRarity(), emptyRarity(), 0),
    aspect: buildAspectPanel(emptyAspect(), emptyAspect(), 0),
    streaks: [],
    streaksHasMore: false,
    cardHits: [],
    duplicates: EMPTY_DUPLICATES,
    showcase: EMPTY_SHOWCASE,
  }
}

function scaleActualsToPlayerPacks<T extends string>(
  actual: Record<T, number>,
  sourcePacks: number,
  targetPacks: number,
  labels: readonly T[],
): Record<T, number> {
  const out: Record<string, number> = {}
  const scale = sourcePacks > 0 ? targetPacks / sourcePacks : 0
  for (const label of labels) {
    out[label] = Number(actual[label] || 0) * scale
  }
  return out as Record<T, number>
}

// ---------------------------------------------------------------------------
// Card-name lookup
// ---------------------------------------------------------------------------

/**
 * Build a cardId → name lookup for a single set. Cached at module scope
 * because `getAllCards()` is frozen at build time.
 */
const nameCache = new Map<string, Map<string, string>>()
function getNameLookup(setCode: string): (cardId: string) => string {
  let map = nameCache.get(setCode)
  if (!map) {
    map = new Map<string, string>()
    for (const card of getAllCards()) {
      if (card.set === setCode && card.cardId) {
        // Keep the first (non-variant) occurrence — base variants come
        // first in cards.json and are the streak target. If a duplicate
        // exists (e.g., reprint), we keep the first; for the streaks
        // dimension only base cards are eligible per U3 anyway.
        if (!map.has(card.cardId)) {
          map.set(card.cardId, card.name)
        }
      }
    }
    nameCache.set(setCode, map)
  }
  const finalMap = map
  return (cardId: string) => finalMap.get(cardId) ?? cardId
}

// ---------------------------------------------------------------------------
// Card metadata lookup (number + aspects) for the histogram
// ---------------------------------------------------------------------------

export interface CardMeta {
  number: number
  name: string
  aspects: string[]
  rarity: string
}

// card_generations.card_id stores the catalog UUID (cards.json `id`, e.g.
// "019d3176-…"), while the expected-distribution map keys by the collector id
// (cardId, e.g. "LAW-032"). This resolver bridges the two so observed pulls
// actually line up with expected — and collapses every variant (Hyperspace,
// Foil, Showcase) of a card onto the same collector id.
const uuidCache = new Map<string, Map<string, string>>()
export function getUuidToCardId(setCode: string): Map<string, string> {
  let map = uuidCache.get(setCode)
  if (map) return map
  map = new Map<string, string>()
  for (const card of getAllCards()) {
    if (card.set !== setCode || !card.id || !card.cardId) continue
    map.set(card.id, card.cardId)
  }
  uuidCache.set(setCode, map)
  return map
}

const metaCache = new Map<string, Map<string, CardMeta>>()
export function getCardMetaLookup(setCode: string): Map<string, CardMeta> {
  let map = metaCache.get(setCode)
  if (map) return map
  map = new Map<string, CardMeta>()
  for (const card of getAllCards()) {
    if (card.set !== setCode || !card.cardId) continue
    if (map.has(card.cardId)) continue
    const num = parseInt(String(card.number ?? '').replace(/\D/g, ''), 10)
    map.set(card.cardId, {
      number: Number.isFinite(num) ? num : 0,
      name: card.name,
      aspects: Array.isArray(card.aspects) ? card.aspects : [],
      rarity: card.rarity || '',
    })
  }
  metaCache.set(setCode, map)
  return map
}

/**
 * Build the per-card histogram: one entry per base-belt card in the set,
 * sorted by collector number. `count` is the user's observed hits (0 shows a
 * faint bar); `delta` and `z` quantify how far that is from expected so the
 * UI can render a "luckier/unluckier than normal" tooltip with a consistent
 * (non-aspect) contrast color. Poisson sigma = sqrt(expected).
 */
export function buildCardHits(
  perCardObserved: Map<string, number>,
  perCardExpected: Map<string, number>,
  meta: Map<string, CardMeta>,
) {
  const hits: Array<{
    cardId: string
    number: number
    name: string
    aspects: string[]
    rarity: string
    count: number
    expected: number
    delta: number
    z: number
    withinNormal: boolean
  }> = []
  for (const [cardId, expected] of perCardExpected) {
    const count = perCardObserved.get(cardId) ?? 0
    const m = meta.get(cardId)
    const sigma = Math.sqrt(Math.max(expected, 1e-9))
    const z = sigma > 0 ? (count - expected) / sigma : 0
    hits.push({
      cardId,
      number: m?.number ?? 0,
      name: m?.name ?? cardId,
      aspects: m?.aspects ?? [],
      rarity: m?.rarity ?? '',
      count,
      expected,
      delta: count - expected,
      z,
      // With a tiny expectation a single hit is unremarkable; only flag when
      // there's enough expected mass for a |z|>2 to be meaningful.
      withinNormal: expected < 1 ? count <= 1 : Math.abs(z) <= 2,
    })
  }
  hits.sort((a, b) => a.number - b.number || a.cardId.localeCompare(b.cardId))
  return hits
}

/**
 * Per-pool duplicate identity = card NAME + SUBTITLE, collapsing every variant
 * (foil / hyperspace / showcase / prestige) onto one gameplay card — the metric
 * the duplicate-rate analysis uses. NEVER key on cardId: LAW gives each variant
 * printing its own cardId, so a cardId key misses normal-vs-hyperspace
 * collisions and under-reports (LAW would read ~0 instead of ~6.7).
 */
const dupIdentityCache = new Map<string, Map<string, string>>()
export function getDupIdentity(setCode: string): (row: GenerationRow) => string {
  let map = dupIdentityCache.get(setCode)
  if (!map) {
    map = new Map<string, string>()
    for (const c of getAllCards()) {
      if (c.set !== setCode || !c.id) continue
      const key = `${(c.name || '').trim()}|${(c.subtitle || '').trim()}`.toLowerCase()
      if (!map.has(c.id)) map.set(c.id, key)
    }
    dupIdentityCache.set(setCode, map)
  }
  const m = map
  return (row) => m.get(row.card_id) || (row.card_name || '').toLowerCase()
}

/**
 * Duplicate-rate widget. Counts duplicates WITHIN each pool by gameplay identity
 * (name+subtitle) so a card's foil/hyperspace printing counts as a repeat of the
 * normal. Expected is NOT zero: per docs/research/duplicate-rate-analysis.md the
 * belt drops same-printing repeats to ~0, but variant slots collide with a card
 * already in the pool — ~4 per sealed pool (SOR–SEC), ~6.7 for LAW/ASH. We pull
 * the per-set expected (sealed-6 vs draft-3, chosen per pool by pack count) from
 * the precomputed duplicateStats.json so the user's actual is judged against the
 * real model, not a placeholder.
 */
function dupModel(setCode: string): { sealed: any; draft: any } | null {
  const s = (duplicateStats as any).sets?.[setCode]
  return s ? { sealed: s.sealed6, draft: s.draft3 } : null
}

export function buildDuplicates(rows: GenerationRow[], setCode: string, identityOf?: (row: GenerationRow) => string) {
  const idOf = identityOf || ((r: GenerationRow) => (r.card_name || r.card_id || '').toLowerCase())
  const byPool = new Map<string, { ids: Map<string, number>; packs: Set<string>; total: number }>()
  for (const r of rows) {
    const id = idOf(r)
    if (!id) continue
    let pool = byPool.get(r.source_id)
    if (!pool) { pool = { ids: new Map(), packs: new Set(), total: 0 }; byPool.set(r.source_id, pool) }
    pool.total += 1
    pool.ids.set(id, (pool.ids.get(id) ?? 0) + 1)
    if (r.pack_index != null && String(r.pack_index) !== 'null') pool.packs.add(String(r.pack_index))
  }

  const model = dupModel(setCode)
  let sumActual = 0
  let poolCount = 0
  let sumPacks = 0
  let expSum = 0
  let expVar = 0
  for (const pool of byPool.values()) {
    if (pool.total === 0) continue
    poolCount += 1
    sumActual += pool.total - pool.ids.size
    const packs = pool.packs.size > 0 ? pool.packs.size : Math.max(1, Math.round(pool.total / 16))
    sumPacks += packs
    if (model) {
      // ≥5 packs ⇒ a sealed 6-pack pool; otherwise a draft-sized pool.
      const m = packs >= 5 ? model.sealed : model.draft
      expSum += Number(m?.mean || 0)
      expVar += Math.pow(Number(m?.sd || 0), 2)
    }
  }

  return {
    pools: poolCount,
    avgPacksPerPool: poolCount > 0 ? sumPacks / poolCount : 0,
    actualPerPool: poolCount > 0 ? sumActual / poolCount : 0,
    expectedPerPool: poolCount > 0 && model ? expSum / poolCount : 0,
    // SE of the model's expected mean across the user's pools (for the z-test).
    expectedSd: poolCount > 0 && model ? Math.sqrt(expVar) / poolCount : 0,
    hasModel: !!model,
  }
}

/**
 * Showcase-rate widget. Showcase leaders are an independent per-pack coin
 * flip (setConfig.upgradeProbabilities.leaderToShowcase, ~1/576). Actual =
 * showcase rows / packs.
 */
export function buildShowcase(
  rows: GenerationRow[],
  packsCracked: number,
  expectedPerPack: number,
) {
  const actualCount = rows.reduce((n, r) => n + (r.is_showcase ? 1 : 0), 0)
  return {
    actualCount,
    actualRate: packsCracked > 0 ? actualCount / packsCracked : 0,
    expectedRate: expectedPerPack,
    expectedCount: expectedPerPack * packsCracked,
  }
}

const EMPTY_DUPLICATES = {
  pools: 0,
  avgPacksPerPool: 0,
  actualPerPool: 0,
  expectedPerPool: 0,
  expectedSd: 0,
  hasModel: false,
}
const EMPTY_SHOWCASE = {
  actualCount: 0,
  actualRate: 0,
  expectedRate: 0,
  expectedCount: 0,
}

// ---------------------------------------------------------------------------
// SQL — scope=kept
// ---------------------------------------------------------------------------

// Only regular booster packs count toward luck — never leader boxes,
// carbonite (which carries its own -CB set code anyway), or anything else.
const KEPT_SQL = `
  SELECT card_id, card_name, rarity, aspects, pack_index, source_id, source_type, treatment, is_showcase
  FROM card_generations
  WHERE user_id = $1
    AND set_code = $2
    AND pack_type = 'booster'
    AND generated_at >= $3
    AND generated_at < ($4::date + interval '1 day')
`

const PLATFORM_KEPT_SQL = `
  SELECT card_id, rarity, aspects, pack_index, source_id, source_type
  FROM card_generations
  WHERE user_id IS NOT NULL
    AND set_code = $1
    AND generated_at >= $2
    AND generated_at < ($3::date + interval '1 day')
`

// ---------------------------------------------------------------------------
// SQL — scope=opened (UNION ALL of sealed + draft sides)
// ---------------------------------------------------------------------------

// Sealed: cracker == pool owner.
const OPENED_SEALED_SQL = `
  SELECT cg.card_id, cg.card_name, cg.rarity, cg.aspects, cg.pack_index, cg.source_id, cg.source_type, cg.treatment, cg.is_showcase
  FROM card_generations cg
  JOIN card_pools cp ON cp.id = cg.source_id
  WHERE cg.source_type = 'sealed'
    AND cp.user_id = $1
    AND cg.set_code = $2
    AND cg.pack_type = 'booster'
    AND cg.generated_at >= $3
    AND cg.generated_at < ($4::date + interval '1 day')
`

// Draft: cracker is the seat whose seat_number - 1 matches the
// packOpenerSeat() formula for that pack_index.
//
// IMPORTANT — explicit `pp.user_id = $authUserId AND pp.is_bot = false` on
// the JOIN (not just WHERE). Without it, the seat predicate alone could
// match bot rows in adversarial pod configurations. The plan flagged this
// as load-bearing.
//
// COALESCE(jsonb_array_length(p.settings->'chaosSets'), 3) gives
// packsPerPlayer at query time (no column for it; chaos picks a per-set
// count, standard defaults to 3). Mirrors the U5 summary route and the
// draft start route (app/api/draft/[shareId]/start/route.ts line 74).
//
// The chaos branch's modulus is the literal 8 — see file header and
// src/utils/packOpenerSeat.ts CHAOS_PACKS_PER_SET_GROUP.
//
// seat_number is 1-indexed (host = 1) so we compare against
// packOpenerSeat() + 1.
const OPENED_DRAFT_SQL = `
  SELECT cg.card_id, cg.card_name, cg.rarity, cg.aspects, cg.pack_index, cg.source_id, cg.source_type, cg.treatment, cg.is_showcase
  FROM card_generations cg
  JOIN pods p ON p.id = cg.source_id
  JOIN pod_players pp ON pp.pod_id = p.id
                      AND pp.user_id = $1
                      AND pp.is_bot = false
  WHERE cg.source_type = 'draft'
    AND cg.set_code = $2
    AND cg.pack_type = 'booster'
    AND cg.generated_at >= $3
    AND cg.generated_at < ($4::date + interval '1 day')
    AND (
      (COALESCE(p.settings->>'draftMode', '') <> 'chaos'
        AND pp.seat_number = floor(cg.pack_index::int / COALESCE(jsonb_array_length(p.settings->'chaosSets'), 3))::int + 1)
      OR
      (p.settings->>'draftMode' = 'chaos'
        AND pp.seat_number = (cg.pack_index::int % 8) + 1)
    )
`

const PLATFORM_OPENED_SQL = `
  SELECT card_id, rarity, aspects, pack_index, source_id, source_type
  FROM card_generations
  WHERE set_code = $1
    AND generated_at >= $2
    AND generated_at < ($3::date + interval '1 day')
`

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse as unknown as NextResponse

    const session = requireAuth(request)
    const { searchParams } = new URL(request.url)

    // --- query params ---
    let setCode: string
    let scope: Scope
    let since: string
    let until: string
    try {
      setCode = parseSetCodeParam(searchParams.get('setCode'))
      scope = parseScopeParam(searchParams.get('scope')) ?? 'opened'
      since = parseDateParam(searchParams.get('since')) ?? DEFAULT_SINCE
      until = parseDateParam(searchParams.get('until')) ?? DEFAULT_UNTIL
    } catch (e) {
      return errorResponse(
        e instanceof Error ? e.message : 'Invalid query parameter',
        400,
      ) as unknown as NextResponse
    }

    // --- pull rows ---
    let rows: GenerationRow[]
    if (scope === 'kept') {
      rows = (await queryRows(KEPT_SQL, [
        session.id,
        setCode,
        since,
        until,
      ])) as unknown as GenerationRow[]
    } else {
      // scope === 'opened' — UNION sealed + draft sides at the app level
      // rather than via SQL UNION ALL because the two queries use the
      // same parameter shape but different JOIN graphs. Two separate
      // queries are cheaper to plan and let pg use the right index per
      // side without a planner gambit.
      const [sealedRows, draftRows] = await Promise.all([
        queryRows(OPENED_SEALED_SQL, [
          session.id,
          setCode,
          since,
          until,
        ]) as Promise<GenerationRow[]>,
        queryRows(OPENED_DRAFT_SQL, [
          session.id,
          setCode,
          since,
          until,
        ]) as Promise<GenerationRow[]>,
      ])
      rows = [...sealedRows, ...draftRows]
    }

    // --- aggregate observed ---
    const observed = aggregateObserved(rows)

    // --- empty path ---
    if (observed.packsCracked === 0) {
      const body = buildEmptyResponse(setCode, scope)
      const response = jsonResponse(body)
      response.headers.set('Cache-Control', 'private, max-age=60')
      response.headers.set('Vary', 'Cookie')
      return response as unknown as NextResponse
    }

    // --- expected ---
    // Unknown setCode → expected = null. Empty rarity/aspect/streaks and
    // every verdict in `insufficient`. The user can still see "we don't
    // have spec data for this set yet" through the empty response shape.
    const perPack = getExpectedPerPack(setCode)
    if (!perPack) {
      const body = buildEmptyResponse(setCode, scope)
      const response = jsonResponse(body)
      response.headers.set('Cache-Control', 'private, max-age=60')
      response.headers.set('Vary', 'Cookie')
      return response as unknown as NextResponse
    }
    // packsCracked from distinct (source_id, pack_index) UNDERCOUNTS whenever
    // pack_index is null (older pools wrote one null index for a whole pool).
    // Every booster is ~16 cards, so rows/16 is a robust floor; take the larger
    // of the two so a reliable pack_index still wins. This keeps "expected"
    // scaled to the packs actually opened — otherwise expected reads far too
    // low and every aspect looks "lucky".
    const CARDS_PER_PACK = 16
    const effectivePacks = Math.max(
      observed.packsCracked,
      Math.round(rows.length / CARDS_PER_PACK),
    )
    const expectedTotal = scaleExpected(perPack, effectivePacks)

    const platformRows = (await queryRows(
      scope === 'kept' ? PLATFORM_KEPT_SQL : PLATFORM_OPENED_SQL,
      [setCode, since, until],
    )) as unknown as GenerationRow[]
    const platformObserved = aggregateObserved(platformRows)
    const platformRarityForPlayerPacks = scaleActualsToPlayerPacks(
      platformObserved.rarity,
      platformObserved.packsCracked,
      observed.packsCracked,
      RARITIES,
    )
    const platformAspectForPlayerPacks = scaleActualsToPlayerPacks(
      platformObserved.aspect,
      platformObserved.packsCracked,
      observed.packsCracked,
      ASPECT_CATEGORIES,
    )

    // --- panels ---
    const rarityPanel = buildRarityPanel(
      observed.rarity,
      expectedTotal.rarity,
      observed.packsCracked,
      platformRarityForPlayerPacks,
      platformObserved.packsCracked,
    )
    const aspectPanel = buildAspectPanel(
      observed.aspect,
      expectedTotal.aspect,
      observed.packsCracked,
      platformAspectForPlayerPacks,
      platformObserved.packsCracked,
    )

    // Collapse observed pulls from the catalog UUID (what the DB stores) to the
    // collector id (cardId, what expected is keyed by), folding every variant of
    // a card onto one identity. Without this, per-card observed never matches
    // expected and the histogram + streaks read as all-zero.
    const uuidToCardId = getUuidToCardId(setCode)
    const observedByCardId = new Map<string, number>()
    for (const [uuid, count] of observed.perCard) {
      const cardId = uuidToCardId.get(uuid) ?? uuid
      observedByCardId.set(cardId, (observedByCardId.get(cardId) ?? 0) + count)
    }

    // --- streaks ---
    // PRIVACY: per-card pull history. NEVER expose in a shareable view
    // without an explicit privacy decision.
    const nameLookup = getNameLookup(setCode)
    const streaksResult = buildStreaks(
      observedByCardId,
      expectedTotal.cards,
      effectivePacks,
      nameLookup,
    )

    // --- card histogram + duplicate / showcase widgets ---
    const cardMeta = getCardMetaLookup(setCode)
    const cardHits = buildCardHits(observedByCardId, expectedTotal.cards, cardMeta)
    const duplicates = buildDuplicates(rows, setCode, getDupIdentity(setCode))
    const setConfig = getSetConfig(setCode)
    const showcasePerPack = Number(setConfig?.upgradeProbabilities?.leaderToShowcase || 0)
    const showcase = buildShowcase(rows, effectivePacks, showcasePerPack)

    const body = {
      setCode,
      scope,
      packsCracked: effectivePacks,
      rarity: rarityPanel,
      aspect: aspectPanel,
      streaks: streaksResult.streaks,
      streaksHasMore: streaksResult.hasMore,
      cardHits,
      duplicates,
      showcase,
    }

    const response = jsonResponse(body)
    response.headers.set('Cache-Control', 'private, max-age=60')
    response.headers.set('Vary', 'Cookie')
    return response as unknown as NextResponse
  } catch (error) {
    return handleApiError(error) as unknown as NextResponse
  }
}
