// @ts-nocheck
/**
 * Pack Quality Service
 *
 * Calculates and aggregates pack quality metrics for the public dashboard.
 * Demonstrates that our generated packs match real-world collation rules.
 */

import { queryRow, queryRows } from '@/lib/db'
import {
  SETS_1_3_CONSTANTS,
  SETS_4_6_CONSTANTS,
  SET_7_PLUS_CONSTANTS,
  HS_BELT_CONFIGS,
  type PackConstants,
} from '@/src/utils/packConstants'
import {
  calculateZScore,
  calculateConfidenceInterval,
  categorizePackQualityStatus,
} from '@/src/utils/stats'

// === Types ===

export interface MetricResult {
  observed: number
  expected: number
  observedRate: number
  expectedRate: number
  zScore: number
  status: 'expected' | 'slight_variance' | 'outlier' | 'insufficient_data'
  sampleSize: number
  confidenceInterval: { low: number; high: number }
  displayRate: string // Human-readable like "1 in 6"
}

export interface StructuralMetric {
  metric: string
  passed: number
  failed: number
  rate: number
  status: 'pass' | 'fail' | 'warning'
}

export interface ChiSquaredResult {
  chiSquared: number
  degreesOfFreedom: number
  pValue: number
  status: 'expected' | 'slight_variance' | 'outlier' | 'insufficient_data'
  interpretation: string
}

export interface DuplicateMetric {
  observedMean: number
  observedStdDev: number
  expectedMean: number
  expectedStdDev: number
  zScore: number
  sampleSize: number
  status: 'expected' | 'slight_variance' | 'outlier' | 'insufficient_data'
}

export interface DuplicateMetricGroup {
  sampleSize: number
  baseTreatmentDuplicates: DuplicateMetric
  anyTreatmentDuplicates: DuplicateMetric
  baseTreatmentTriplicates: DuplicateMetric
  anyTreatmentTriplicates: DuplicateMetric
}

export interface DuplicateMetrics {
  sealedUnshuffled: DuplicateMetricGroup
  sealedShuffled: DuplicateMetricGroup
  draftUnshuffled: DuplicateMetricGroup
  draftShuffled: DuplicateMetricGroup
}

export interface PackQualityData {
  setCode: string
  setName: string
  generatedAt: string

  sampleSize: {
    totalPacks: number
    totalCards: number
    packsWithTracking: number
    dateRange: { start: string; end: string } | null
  }

  overallHealth: {
    score: number // 0-100
    status: 'excellent' | 'good' | 'acceptable' | 'needs_attention'
    metricsWithinExpected: number
    totalMetrics: number
  }

  structuralMetrics: StructuralMetric[]

  rarityMetrics: {
    legendaryRate: MetricResult
    foilRarityDistribution: {
      Common: MetricResult
      Uncommon: MetricResult
      Rare: MetricResult
      Legendary: MetricResult
    }
    foilDistributionTest: ChiSquaredResult
  }

  treatmentMetrics: {
    hyperspaceLeader: MetricResult
    hyperspaceBase: MetricResult
    hyperspaceCommon: MetricResult
    hyperfoil: MetricResult
    showcaseLeader: MetricResult
  }

  duplicateMetrics?: DuplicateMetrics

  reference: {
    packStructure: string
    slotOrder: string
    setVariants: Record<string, string>
    dataSource: string
  }
}

// === Helper Functions ===

function getSetNumber(setCode: string): number {
  const setMap: Record<string, number> = {
    SOR: 1, SHD: 2, TWI: 3,
    JTL: 4, LOF: 5, SEC: 6,
    LAW: 7,
  }
  return setMap[setCode] || 4
}

function getPackConstants(setCode: string): PackConstants {
  const setNumber = getSetNumber(setCode)
  if (setNumber <= 3) return SETS_1_3_CONSTANTS
  if (setNumber <= 6) return SETS_4_6_CONSTANTS
  return SET_7_PLUS_CONSTANTS
}

function getSetName(setCode: string): string {
  const names: Record<string, string> = {
    SOR: 'Spark of Rebellion',
    SHD: 'Shadows of the Galaxy',
    TWI: 'Twilight of the Republic',
    JTL: 'Jump to Lightspeed',
    LOF: 'Legacy of the Force',
    SEC: 'Secrets of the Crucible',
    LAW: 'Law of the Wasteland',
  }
  return names[setCode] || setCode
}

// Statistical primitives (calculateZScore, calculateConfidenceInterval, and
// the regime classifier) were extracted to `@/src/utils/stats` so that the
// personal luck analyzer (`luckVerdict`) can share one implementation. The
// re-exported aliases below preserve the existing function names used by
// `buildMetricResult` without changing behavior. See `src/utils/stats.ts` for
// the implementations and inline derivation notes.
const categorizeStatus = categorizePackQualityStatus

/**
 * Format rate as human-readable string
 */
function formatDisplayRate(rate: number): string {
  if (rate === 0) return '0%'
  if (rate >= 1) return '100%'

  // For rates like 0.166... show as "1 in 6"
  const inverse = 1 / rate
  if (inverse >= 2 && inverse <= 1000) {
    const rounded = Math.round(inverse)
    // Check if it's close to a nice fraction
    if (Math.abs(inverse - rounded) < 0.1) {
      return `1 in ${rounded}`
    }
  }

  // Otherwise show as percentage
  if (rate >= 0.01) {
    return `${(rate * 100).toFixed(1)}%`
  }
  return `${(rate * 100).toFixed(2)}%`
}

/**
 * Calculate chi-squared statistic for goodness-of-fit test
 * Compares observed distribution against expected distribution
 */
export function calculateChiSquared(
  observed: Record<string, number>,
  expected: Record<string, number>
): ChiSquaredResult {
  const categories = Object.keys(expected).filter(k => expected[k] > 0)
  const totalObserved = Object.values(observed).reduce((a, b) => a + b, 0)
  const totalExpected = Object.values(expected).reduce((a, b) => a + b, 0)

  if (totalObserved < 50) {
    return {
      chiSquared: 0,
      degreesOfFreedom: categories.length - 1,
      pValue: 1,
      status: 'insufficient_data',
      interpretation: 'Need at least 50 samples for chi-squared test',
    }
  }

  // Scale expected to match total observed
  const scaledExpected: Record<string, number> = {}
  categories.forEach(cat => {
    scaledExpected[cat] = (expected[cat] / totalExpected) * totalObserved
  })

  // Calculate chi-squared statistic
  let chiSquared = 0
  categories.forEach(cat => {
    const o = observed[cat] || 0
    const e = scaledExpected[cat]
    if (e > 0) {
      chiSquared += Math.pow(o - e, 2) / e
    }
  })

  const df = categories.length - 1

  // Approximate p-value using chi-squared CDF
  // Using Wilson-Hilferty approximation for chi-squared CDF
  const pValue = approximateChiSquaredPValue(chiSquared, df)

  // Categorize result
  let status: ChiSquaredResult['status']
  let interpretation: string

  if (pValue >= 0.05) {
    status = 'expected'
    interpretation = 'Distribution matches expected (p >= 0.05)'
  } else if (pValue >= 0.01) {
    status = 'slight_variance'
    interpretation = 'Minor deviation from expected (0.01 <= p < 0.05)'
  } else {
    status = 'outlier'
    interpretation = 'Significant deviation from expected (p < 0.01)'
  }

  return {
    chiSquared: Math.round(chiSquared * 100) / 100,
    degreesOfFreedom: df,
    pValue: Math.round(pValue * 1000) / 1000,
    status,
    interpretation,
  }
}

/**
 * Approximate chi-squared p-value using Wilson-Hilferty transformation
 */
function approximateChiSquaredPValue(chiSquared: number, df: number): number {
  if (df <= 0 || chiSquared < 0) return 1

  // Wilson-Hilferty approximation
  const h = 2 / (9 * df)
  const z = Math.pow(chiSquared / df, 1/3) - (1 - h)
  const z_normalized = z / Math.sqrt(h)

  // Standard normal CDF approximation (Abramowitz and Stegun)
  const t = 1 / (1 + 0.2316419 * Math.abs(z_normalized))
  const d = 0.3989423 * Math.exp(-z_normalized * z_normalized / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))

  // Return 1 - CDF (upper tail probability)
  return z_normalized > 0 ? p : 1 - p
}

/**
 * Build a metric result
 */
export function buildMetricResult(
  observed: number,
  sampleSize: number,
  expectedRate: number,
  minSampleForSignificance: number = 50
): MetricResult {
  const expected = sampleSize * expectedRate
  const observedRate = sampleSize > 0 ? observed / sampleSize : 0
  const zScore = calculateZScore(observed, expected, sampleSize, expectedRate)
  const status = categorizeStatus(zScore, sampleSize, minSampleForSignificance)
  const ci = calculateConfidenceInterval(observed, sampleSize)

  return {
    observed,
    expected: Math.round(expected * 10) / 10,
    observedRate: Math.round(observedRate * 10000) / 10000,
    expectedRate,
    zScore: Math.round(zScore * 100) / 100,
    status,
    sampleSize,
    confidenceInterval: {
      low: Math.round(ci.low * 10000) / 10000,
      high: Math.round(ci.high * 10000) / 10000,
    },
    displayRate: formatDisplayRate(expectedRate),
  }
}

// === Main Service Function ===

/**
 * Get pack quality metrics for a specific set.
 *
 * Analyzes ALL tracked packs (sealed and draft alike — a pack is a pack).
 *
 * IMPORTANT: The `since` parameter should be set to exclude data before position-based
 * slot_type tracking was deployed (2026-02-12). Earlier data used rarity-based inference
 * which incorrectly classified upgraded slots (e.g., UC3→Rare was marked as 'rare_legendary'
 * instead of 'uncommon').
 *
 * @param setCode - The set code (SOR, SHD, TWI, JTL, LOF, SEC, LAW)
 * @param since - ISO date string to filter data (default: 2026-02-12, when position-based tracking was deployed)
 */
export async function getPackQualityData(setCode: string, since: string = '2026-02-12'): Promise<PackQualityData> {
  const constants = getPackConstants(setCode)
  const setNumber = getSetNumber(setCode)

  // Get basic counts
  const countStats = await queryRow(
    `SELECT
      COUNT(*) as total_cards,
      COUNT(DISTINCT (source_id, COALESCE(pack_index, -1))) as estimated_packs,
      COUNT(*) FILTER (WHERE pack_index IS NOT NULL) as tracked_cards,
      MIN(generated_at) as first_generated,
      MAX(generated_at) as last_generated
     FROM card_generations
     WHERE set_code = $1 AND generated_at >= $2`,
    [setCode, since]
  )

  const totalCards = parseInt(countStats?.total_cards || 0)
  const estimatedPacks = Math.floor(totalCards / 16) // 16 cards per pack
  const trackedCards = parseInt(countStats?.tracked_cards || 0)
  const packsWithTracking = Math.floor(trackedCards / 16)

  // === STRUCTURAL METRICS ===
  const structuralMetrics: StructuralMetric[] = []

  // 1. Pack size compliance (should be 16 cards per pack)
  // We check packs with pack_index tracking
  const packSizeStats = await queryRows(
    `SELECT
      source_id,
      pack_index,
      COUNT(*) as card_count
     FROM card_generations
     WHERE set_code = $1 AND pack_index IS NOT NULL AND generated_at >= $2
     GROUP BY source_id, pack_index`,
    [setCode, since]
  )

  const correctSizePacks = packSizeStats.filter(p => parseInt(p.card_count) === 16).length
  const totalTrackedPacks = packSizeStats.length

  structuralMetrics.push({
    metric: 'Pack Size (16 cards)',
    passed: correctSizePacks,
    failed: totalTrackedPacks - correctSizePacks,
    rate: totalTrackedPacks > 0 ? correctSizePacks / totalTrackedPacks : 1,
    status: totalTrackedPacks === 0 ? 'warning' :
            correctSizePacks === totalTrackedPacks ? 'pass' : 'fail',
  })

  // 2. No same-treatment duplicates within a pack
  const dupStats = await queryRow(
    `SELECT COUNT(DISTINCT (source_id, pack_index)) as packs_with_dupes
     FROM (
       SELECT source_id, pack_index
       FROM card_generations
       WHERE set_code = $1 AND pack_index IS NOT NULL AND generated_at >= $2
       GROUP BY source_id, pack_index, card_name, treatment
       HAVING COUNT(*) > 1
     ) dupes`,
    [setCode, since]
  )
  const packsWithDupes = parseInt(dupStats?.packs_with_dupes || 0)

  structuralMetrics.push({
    metric: 'No Same-Treatment Duplicates',
    passed: totalTrackedPacks - packsWithDupes,
    failed: packsWithDupes,
    rate: totalTrackedPacks > 0 ? (totalTrackedPacks - packsWithDupes) / totalTrackedPacks : 1,
    status: packsWithDupes === 0 ? 'pass' : 'fail',
  })

  // 3. Leader count per pack (should be 1)
  const leaderStats = await queryRows(
    `SELECT
      source_id,
      pack_index,
      COUNT(*) FILTER (WHERE slot_type = 'leader') as leader_count
     FROM card_generations
     WHERE set_code = $1 AND pack_index IS NOT NULL AND generated_at >= $2
     GROUP BY source_id, pack_index`,
    [setCode, since]
  )
  const correctLeaderPacks = leaderStats.filter(p => parseInt(p.leader_count) === 1).length

  structuralMetrics.push({
    metric: 'One Leader Per Pack',
    passed: correctLeaderPacks,
    failed: leaderStats.length - correctLeaderPacks,
    rate: leaderStats.length > 0 ? correctLeaderPacks / leaderStats.length : 1,
    status: leaderStats.length === 0 ? 'warning' :
            correctLeaderPacks === leaderStats.length ? 'pass' : 'fail',
  })

  // 4. Base count per pack (should be 1)
  const baseStats = await queryRows(
    `SELECT
      source_id,
      pack_index,
      COUNT(*) FILTER (WHERE slot_type = 'base') as base_count
     FROM card_generations
     WHERE set_code = $1 AND pack_index IS NOT NULL AND generated_at >= $2
     GROUP BY source_id, pack_index`,
    [setCode, since]
  )
  const correctBasePacks = baseStats.filter(p => parseInt(p.base_count) === 1).length

  structuralMetrics.push({
    metric: 'One Base Per Pack',
    passed: correctBasePacks,
    failed: baseStats.length - correctBasePacks,
    rate: baseStats.length > 0 ? correctBasePacks / baseStats.length : 1,
    status: baseStats.length === 0 ? 'warning' :
            correctBasePacks === baseStats.length ? 'pass' : 'fail',
  })

  // 5. Slot composition per pack
  // Expected: 1 Leader, 1 Base, 9 Commons, 3 Uncommons, 1 Rare/Legendary, 1 Foil = 16 cards
  const slotCompositionStats = await queryRows(
    `SELECT
      source_id,
      pack_index,
      COUNT(*) FILTER (WHERE slot_type = 'leader') as leaders,
      COUNT(*) FILTER (WHERE slot_type = 'base') as bases,
      COUNT(*) FILTER (WHERE slot_type = 'common') as commons,
      COUNT(*) FILTER (WHERE slot_type = 'uncommon') as uncommons,
      COUNT(*) FILTER (WHERE slot_type = 'rare_legendary') as rare_legendaries,
      COUNT(*) FILTER (WHERE slot_type = 'foil') as foils
     FROM card_generations
     WHERE set_code = $1 AND pack_index IS NOT NULL AND generated_at >= $2
     GROUP BY source_id, pack_index`,
    [setCode, since]
  )

  // A pack has correct composition if: 1L, 1B, 9C, 3U, 1R/L, 1F
  const correctCompositionPacks = slotCompositionStats.filter(p =>
    parseInt(p.leaders) === 1 &&
    parseInt(p.bases) === 1 &&
    parseInt(p.commons) === 9 &&
    parseInt(p.uncommons) === 3 &&
    parseInt(p.rare_legendaries) === 1 &&
    parseInt(p.foils) === 1
  ).length

  structuralMetrics.push({
    metric: 'Slot Composition (1L/1B/9C/3U/1R/1F)',
    passed: correctCompositionPacks,
    failed: slotCompositionStats.length - correctCompositionPacks,
    rate: slotCompositionStats.length > 0 ? correctCompositionPacks / slotCompositionStats.length : 1,
    status: slotCompositionStats.length === 0 ? 'warning' :
            correctCompositionPacks === slotCompositionStats.length ? 'pass' : 'fail',
  })

  // === RARITY METRICS ===

  // Legendary rate in rare/legendary slot
  const rareLegendaryStats = await queryRow(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE rarity = 'Legendary') as legendary_count
     FROM card_generations
     WHERE set_code = $1 AND slot_type = 'rare_legendary' AND generated_at >= $2`,
    [setCode, since]
  )

  const rlTotal = parseInt(rareLegendaryStats?.total || 0)
  const legendaryCount = parseInt(rareLegendaryStats?.legendary_count || 0)
  const expectedLegendaryRate = 1 / (constants.rareSlotLegendaryRatio + 1)

  const legendaryMetric = buildMetricResult(legendaryCount, rlTotal, expectedLegendaryRate, 100)

  // Foil slot rarity distribution
  const foilStats = await queryRows(
    `SELECT rarity, COUNT(*) as count
     FROM card_generations
     WHERE set_code = $1 AND slot_type = 'foil' AND generated_at >= $2
     GROUP BY rarity`,
    [setCode, since]
  )

  const foilTotal = foilStats.reduce((sum, r) => sum + parseInt(r.count), 0)
  const foilByRarity: Record<string, number> = {}
  foilStats.forEach(r => { foilByRarity[r.rarity] = parseInt(r.count) })

  const foilWeights = constants.foilSlotWeights || {
    Common: 70, Uncommon: 20, Rare: 8, Legendary: 2, Special: 0
  }
  const totalWeight = Object.values(foilWeights).reduce((a, b) => a + b, 0)

  const foilRarityMetrics = {
    Common: buildMetricResult(
      foilByRarity.Common || 0,
      foilTotal,
      foilWeights.Common / totalWeight,
      50
    ),
    Uncommon: buildMetricResult(
      foilByRarity.Uncommon || 0,
      foilTotal,
      foilWeights.Uncommon / totalWeight,
      50
    ),
    Rare: buildMetricResult(
      foilByRarity.Rare || 0,
      foilTotal,
      foilWeights.Rare / totalWeight,
      50
    ),
    Legendary: buildMetricResult(
      foilByRarity.Legendary || 0,
      foilTotal,
      foilWeights.Legendary / totalWeight,
      50
    ),
  }

  // Chi-squared test for foil rarity distribution
  const foilDistributionTest = calculateChiSquared(
    foilByRarity,
    { Common: foilWeights.Common, Uncommon: foilWeights.Uncommon, Rare: foilWeights.Rare, Legendary: foilWeights.Legendary }
  )

  // === TREATMENT METRICS ===

  // Hyperspace leader rate
  const leaderTreatmentStats = await queryRow(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE treatment = 'hyperspace') as hyperspace_count
     FROM card_generations
     WHERE set_code = $1 AND slot_type = 'leader' AND generated_at >= $2`,
    [setCode, since]
  )

  const leaderTotal = parseInt(leaderTreatmentStats?.total || 0)
  const hsLeaderCount = parseInt(leaderTreatmentStats?.hyperspace_count || 0)
  const hyperspaceLeaderMetric = buildMetricResult(
    hsLeaderCount,
    leaderTotal,
    constants.leaderHyperspaceRate,
    50
  )

  // Hyperspace base rate
  const baseTreatmentStats = await queryRow(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE treatment = 'hyperspace') as hyperspace_count
     FROM card_generations
     WHERE set_code = $1 AND slot_type = 'base' AND generated_at >= $2`,
    [setCode, since]
  )

  const baseTotal = parseInt(baseTreatmentStats?.total || 0)
  const hsBaseCount = parseInt(baseTreatmentStats?.hyperspace_count || 0)
  const hyperspaceBaseMetric = buildMetricResult(
    hsBaseCount,
    baseTotal,
    constants.baseHyperspaceRate,
    50
  )

  // Packs with at least 1 Hyperspace upgrade (any slot: leader, base, common, UC, rare)
  // Expected rate from HS belt: 2/3 for sets 1-6, 100% for LAW+
  const hsBeltKey = setNumber <= 3 ? '1-3' : setNumber <= 6 ? '4-6' : 'LAW'
  const hsBeltConfig = HS_BELT_CONFIGS[hsBeltKey]
  const expectedHsPackRate = hsBeltConfig
    ? (hsBeltConfig.cycleSize - hsBeltConfig.budgetDistribution[0]) / hsBeltConfig.cycleSize
    : 2 / 3

  const hsPackStats = await queryRows(
    `SELECT
      source_id,
      pack_index,
      COUNT(*) FILTER (WHERE treatment = 'hyperspace') as hs_count
     FROM card_generations
     WHERE set_code = $1 AND pack_index IS NOT NULL AND generated_at >= $2
     GROUP BY source_id, pack_index`,
    [setCode, since]
  )

  const totalHsPacks = hsPackStats.length
  const packsWithHs = hsPackStats.filter(p => parseInt(p.hs_count) > 0).length
  const hsCommonMetric = buildMetricResult(
    packsWithHs,
    totalHsPacks,
    expectedHsPackRate,
    100
  )

  // Hyperfoil rate
  const foilTreatmentStats = await queryRow(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE treatment = 'hyperspace_foil') as hyperfoil_count
     FROM card_generations
     WHERE set_code = $1 AND slot_type = 'foil' AND generated_at >= $2`,
    [setCode, since]
  )

  const foilTreatmentTotal = parseInt(foilTreatmentStats?.total || 0)
  const hyperfoilCount = parseInt(foilTreatmentStats?.hyperfoil_count || 0)
  const hyperfoilMetric = buildMetricResult(
    hyperfoilCount,
    foilTreatmentTotal,
    constants.hyperfoilRate,
    200 // Need more samples for rare events
  )

  // Showcase leader rate
  const showcaseStats = await queryRow(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE treatment = 'showcase') as showcase_count
     FROM card_generations
     WHERE set_code = $1 AND slot_type = 'leader' AND generated_at >= $2`,
    [setCode, since]
  )

  const showcaseTotal = parseInt(showcaseStats?.total || 0)
  const showcaseCount = parseInt(showcaseStats?.showcase_count || 0)
  const showcaseMetric = buildMetricResult(
    showcaseCount,
    showcaseTotal,
    constants.showcaseLeaderRate,
    500 // Very rare, need lots of samples
  )

  // === DUPLICATE/TRIPLICATE METRICS ===
  // Split into sealed (6 packs per pool) and draft (3 packs per player).
  // Previous approach mixed both, causing extreme z-scores because draft pods
  // grouped 24 packs (all players) against 6-pack expected values.

  // Expected values from baseline analysis (500 iterations using generateBoosterPack)
  // Sealed: 6 consecutive packs from same belt run
  const EXPECTED_SEALED = {
    dupBase: { mean: 1.07, stdDev: 0.80 },
    dupAny: { mean: 3.68, stdDev: 1.39 },
    tripBase: { mean: 0.0, stdDev: 0.05 },
    tripAny: { mean: 0.10, stdDev: 0.33 },
  }
  // Draft: 3 consecutive packs per player from same belt run
  const EXPECTED_DRAFT = {
    dupBase: { mean: 0.11, stdDev: 0.34 },
    dupAny: { mean: 0.78, stdDev: 0.83 },
    tripBase: { mean: 0.0, stdDev: 0.05 },
    tripAny: { mean: 0.0, stdDev: 0.06 },
  }

  // Shuffled packs come from random box positions → more duplicates expected.
  // Wider stdDev until we have enough data to calibrate precisely.
  const EXPECTED_SEALED_SHUFFLED = {
    dupBase: { mean: 2.5, stdDev: 1.5 },
    dupAny: { mean: 5.0, stdDev: 2.0 },
    tripBase: { mean: 0.1, stdDev: 0.3 },
    tripAny: { mean: 0.3, stdDev: 0.5 },
  }
  const EXPECTED_DRAFT_SHUFFLED = {
    dupBase: { mean: 0.3, stdDev: 0.5 },
    dupAny: { mean: 1.2, stdDev: 1.0 },
    tripBase: { mean: 0.0, stdDev: 0.1 },
    tripAny: { mean: 0.0, stdDev: 0.1 },
  }

  // Helper: calculate duplicate stats for a set of card groups
  const calcDuplicateStats = (
    groups: Record<string, Array<{ card_name: string; card_id: string; treatment: string }>>,
    expected: typeof EXPECTED_SEALED,
  ): DuplicateMetricGroup => {
    const groupIds = Object.keys(groups)
    const groupCount = groupIds.length

    const dupBaseValues: number[] = []
    const dupAnyValues: number[] = []
    const tripBaseValues: number[] = []
    const tripAnyValues: number[] = []

    groupIds.forEach(groupId => {
      const cards = groups[groupId]

      // Base treatment: only 'base' treatment (Normal variant, no foil/HS/showcase)
      const baseCards = cards.filter(c => c.treatment === 'base')
      const baseNameCounts: Record<string, number> = {}
      baseCards.forEach(c => {
        baseNameCounts[c.card_name] = (baseNameCounts[c.card_name] || 0) + 1
      })
      const baseDupes = Object.values(baseNameCounts).filter(n => n > 1).reduce((sum, n) => sum + (n - 1), 0)
      const baseTrips = Object.values(baseNameCounts).filter(n => n > 2).reduce((sum, n) => sum + (n - 2), 0)

      // Any treatment: exact card_id
      const exactIdCounts: Record<string, number> = {}
      cards.forEach(c => {
        exactIdCounts[c.card_id] = (exactIdCounts[c.card_id] || 0) + 1
      })
      const anyDupes = Object.values(exactIdCounts).filter(n => n > 1).reduce((sum, n) => sum + (n - 1), 0)
      const anyTrips = Object.values(exactIdCounts).filter(n => n > 2).reduce((sum, n) => sum + (n - 2), 0)

      dupBaseValues.push(baseDupes)
      dupAnyValues.push(anyDupes)
      tripBaseValues.push(baseTrips)
      tripAnyValues.push(anyTrips)
    })

    const calcObservedStats = (arr: number[]) => {
      if (arr.length === 0) return { mean: 0, stdDev: 0 }
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length
      const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length
      return { mean, stdDev: Math.sqrt(variance) }
    }

    const calcDupZScore = (observed: number, exp: number, stdDev: number, n: number) => {
      if (n === 0 || stdDev === 0) return 0
      return (observed - exp) / (stdDev / Math.sqrt(n))
    }

    const categorizeDupStatus = (zScore: number, sampleSize: number): DuplicateMetric['status'] => {
      if (sampleSize < 10) return 'insufficient_data'
      const absZ = Math.abs(zScore)
      if (absZ < 2.0) return 'expected'
      if (absZ < 3.0) return 'slight_variance'
      return 'outlier'
    }

    const buildDupMetric = (
      observed: { mean: number; stdDev: number },
      exp: { mean: number; stdDev: number },
      n: number
    ): DuplicateMetric => {
      const zScore = calcDupZScore(observed.mean, exp.mean, exp.stdDev, n)
      return {
        observedMean: Math.round(observed.mean * 1000) / 1000,
        observedStdDev: Math.round(observed.stdDev * 1000) / 1000,
        expectedMean: exp.mean,
        expectedStdDev: exp.stdDev,
        zScore: Math.round(zScore * 100) / 100,
        sampleSize: n,
        status: categorizeDupStatus(zScore, n),
      }
    }

    const dupBaseObs = calcObservedStats(dupBaseValues)
    const dupAnyObs = calcObservedStats(dupAnyValues)
    const tripBaseObs = calcObservedStats(tripBaseValues)
    const tripAnyObs = calcObservedStats(tripAnyValues)

    return {
      sampleSize: groupCount,
      baseTreatmentDuplicates: buildDupMetric(dupBaseObs, expected.dupBase, groupCount),
      anyTreatmentDuplicates: buildDupMetric(dupAnyObs, expected.dupAny, groupCount),
      baseTreatmentTriplicates: buildDupMetric(tripBaseObs, expected.tripBase, groupCount),
      anyTreatmentTriplicates: buildDupMetric(tripAnyObs, expected.tripAny, groupCount),
    }
  }

  // --- Sealed duplicate analysis (6 packs per pool, grouped by source_id) ---
  // JOIN card_pools to get shuffled_packs flag
  const sealedPoolData = await queryRows(
    `SELECT cg.source_id, cg.card_name, cg.card_id, cg.treatment,
            COALESCE(cp.shuffled_packs, false) as shuffled
     FROM card_generations cg
     LEFT JOIN card_pools cp ON cp.id = cg.source_id
     WHERE cg.set_code = $1 AND cg.generated_at >= $2
       AND cg.source_type = 'sealed'
       AND cg.slot_type NOT IN ('leader', 'base')
     ORDER BY cg.source_id`,
    [setCode, since]
  )

  // Determine shuffle state per source_id (all rows for a source share the same shuffle state)
  const sealedShuffleState: Record<string, boolean> = {}
  sealedPoolData.forEach(row => {
    if (!(row.source_id in sealedShuffleState)) {
      sealedShuffleState[row.source_id] = row.shuffled === true || row.shuffled === 't'
    }
  })

  const sealedUnshuffledGroups: Record<string, Array<{ card_name: string; card_id: string; treatment: string }>> = {}
  const sealedShuffledGroups: Record<string, Array<{ card_name: string; card_id: string; treatment: string }>> = {}
  sealedPoolData.forEach(row => {
    const groups = sealedShuffleState[row.source_id] ? sealedShuffledGroups : sealedUnshuffledGroups
    if (!groups[row.source_id]) groups[row.source_id] = []
    groups[row.source_id].push({ card_name: row.card_name, card_id: row.card_id, treatment: row.treatment })
  })

  // --- Draft duplicate analysis (3 packs per player, grouped by source_id + player) ---
  // pack_index = playerIndex * 3 + packIndex, so floor(pack_index / 3) = player index
  // JOIN pods to get shuffled_packs flag
  const draftPoolData = await queryRows(
    `SELECT cg.source_id, cg.pack_index, cg.card_name, cg.card_id, cg.treatment,
            COALESCE(p.shuffled_packs, false) as shuffled
     FROM card_generations cg
     LEFT JOIN pods p ON p.id = cg.source_id
     WHERE cg.set_code = $1 AND cg.generated_at >= $2
       AND cg.source_type = 'draft'
       AND cg.slot_type NOT IN ('leader', 'base')
       AND cg.pack_index IS NOT NULL
     ORDER BY cg.source_id, cg.pack_index`,
    [setCode, since]
  )

  // Determine shuffle state per source_id
  const draftShuffleState: Record<string, boolean> = {}
  draftPoolData.forEach(row => {
    if (!(row.source_id in draftShuffleState)) {
      draftShuffleState[row.source_id] = row.shuffled === true || row.shuffled === 't'
    }
  })

  const draftUnshuffledGroups: Record<string, Array<{ card_name: string; card_id: string; treatment: string }>> = {}
  const draftShuffledGroups: Record<string, Array<{ card_name: string; card_id: string; treatment: string }>> = {}
  draftPoolData.forEach(row => {
    const playerIdx = Math.floor(row.pack_index / 3)
    const groupKey = `${row.source_id}-player${playerIdx}`
    const groups = draftShuffleState[row.source_id] ? draftShuffledGroups : draftUnshuffledGroups
    if (!groups[groupKey]) groups[groupKey] = []
    groups[groupKey].push({ card_name: row.card_name, card_id: row.card_id, treatment: row.treatment })
  })

  const duplicateMetrics: DuplicateMetrics = {
    sealedUnshuffled: calcDuplicateStats(sealedUnshuffledGroups, EXPECTED_SEALED),
    sealedShuffled: calcDuplicateStats(sealedShuffledGroups, EXPECTED_SEALED_SHUFFLED),
    draftUnshuffled: calcDuplicateStats(draftUnshuffledGroups, EXPECTED_DRAFT),
    draftShuffled: calcDuplicateStats(draftShuffledGroups, EXPECTED_DRAFT_SHUFFLED),
  }

  // === OVERALL HEALTH ===

  // Count metrics that are "expected" or "slight_variance"
  const allMetrics = [
    legendaryMetric,
    foilRarityMetrics.Common,
    foilRarityMetrics.Uncommon,
    foilRarityMetrics.Rare,
    foilRarityMetrics.Legendary,
    hyperspaceLeaderMetric,
    hyperspaceBaseMetric,
    hsCommonMetric,
    hyperfoilMetric,
    showcaseMetric,
  ]

  const metricsWithinExpected = allMetrics.filter(
    m => m.status === 'expected' || m.status === 'slight_variance' || m.status === 'insufficient_data'
  ).length

  const structuralPassing = structuralMetrics.filter(m => m.status === 'pass').length
  const totalStructural = structuralMetrics.filter(m => m.status !== 'warning').length

  // Count duplicate metrics within expected range (all 4 groups × 4 metrics = 16 total)
  const allDupMetrics = [
    duplicateMetrics.sealedUnshuffled.baseTreatmentDuplicates,
    duplicateMetrics.sealedUnshuffled.anyTreatmentDuplicates,
    duplicateMetrics.sealedUnshuffled.baseTreatmentTriplicates,
    duplicateMetrics.sealedUnshuffled.anyTreatmentTriplicates,
    duplicateMetrics.sealedShuffled.baseTreatmentDuplicates,
    duplicateMetrics.sealedShuffled.anyTreatmentDuplicates,
    duplicateMetrics.sealedShuffled.baseTreatmentTriplicates,
    duplicateMetrics.sealedShuffled.anyTreatmentTriplicates,
    duplicateMetrics.draftUnshuffled.baseTreatmentDuplicates,
    duplicateMetrics.draftUnshuffled.anyTreatmentDuplicates,
    duplicateMetrics.draftUnshuffled.baseTreatmentTriplicates,
    duplicateMetrics.draftUnshuffled.anyTreatmentTriplicates,
    duplicateMetrics.draftShuffled.baseTreatmentDuplicates,
    duplicateMetrics.draftShuffled.anyTreatmentDuplicates,
    duplicateMetrics.draftShuffled.baseTreatmentTriplicates,
    duplicateMetrics.draftShuffled.anyTreatmentTriplicates,
  ]
  const dupMetricsPassing = allDupMetrics
    .filter(m => m.status === 'expected' || m.status === 'slight_variance' || m.status === 'insufficient_data').length
  const totalDupMetrics = allDupMetrics.length

  const healthScore = Math.round(
    ((metricsWithinExpected / allMetrics.length) * 0.5 +
     (totalStructural > 0 ? structuralPassing / totalStructural : 1) * 0.3 +
     (dupMetricsPassing / totalDupMetrics) * 0.2) * 100
  )

  const healthStatus = healthScore >= 95 ? 'excellent' :
                       healthScore >= 85 ? 'good' :
                       healthScore >= 70 ? 'acceptable' : 'needs_attention'

  return {
    setCode,
    setName: getSetName(setCode),
    generatedAt: new Date().toISOString(),

    sampleSize: {
      totalPacks: estimatedPacks,
      totalCards,
      packsWithTracking,
      dateRange: countStats?.first_generated ? {
        start: countStats.first_generated,
        end: countStats.last_generated,
      } : null,
    },

    overallHealth: {
      score: healthScore,
      status: healthStatus,
      metricsWithinExpected,
      totalMetrics: allMetrics.length,
    },

    structuralMetrics,

    rarityMetrics: {
      legendaryRate: legendaryMetric,
      foilRarityDistribution: foilRarityMetrics,
      foilDistributionTest,
    },

    treatmentMetrics: {
      hyperspaceLeader: hyperspaceLeaderMetric,
      hyperspaceBase: hyperspaceBaseMetric,
      hyperspaceCommon: hsCommonMetric,
      hyperfoil: hyperfoilMetric,
      showcaseLeader: showcaseMetric,
    },

    duplicateMetrics,

    reference: {
      packStructure: '16 cards: 1 Leader, 1 Base, 9 Commons, 3 Uncommons, 1 Rare/Legendary, 1 Foil',
      slotOrder: 'Leader → Base → 9 Commons (Belt A/B alternating) → 3 Uncommons (UC3 can upgrade) → Rare/Legendary → Foil',
      setVariants: {
        'Sets 1-3': 'UC3 upgrades to HS R/L at ~1/5.5 rate',
        'Sets 4-6': 'UC3 upgrades at ~1/5 rate, Special rarity in foil slot',
        'Set 7+': 'Foil slot always Hyperspace Foil, guaranteed HS common',
      },
      dataSource: 'Community box break analysis and FFG announcements',
    },
  }
}

/**
 * Get available sets with data
 */
export async function getAvailableSets(): Promise<{ setCode: string; setName: string; packCount: number }[]> {
  const results = await queryRows(
    `SELECT set_code, COUNT(*) / 16 as pack_count
     FROM card_generations
     GROUP BY set_code
     ORDER BY set_code`
  )

  return results.map(r => ({
    setCode: r.set_code,
    setName: getSetName(r.set_code),
    packCount: parseInt(r.pack_count),
  }))
}
