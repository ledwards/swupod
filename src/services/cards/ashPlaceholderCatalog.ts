// @ts-nocheck
/**
 * ASH spoiler placeholder catalog.
 *
 * ASH starts life as a partially spoiled set. Placeholder cards represent
 * pack/belt inventory buckets, not guessed collector numbers. This keeps the
 * pack experience honest: rarity, aspect bucket, and treatment are known; exact
 * card identity and collector number are not known until a real spoiler arrives.
 */

export const ASH_SET_CODE = 'ASH'
export const ASH_PLACEHOLDER_VERSION = '2026-05-20-sec-shaped-law-multicolor-v2'
export const ASH_EXPECTED_NORMAL_SLOTS = 264
export const ASH_MAIN_DECK_MULTICOLOR_SLOTS = 24
export const ASH_PRIMARY_PRIMARY_LEADER_SLOTS = 2
export const ASH_PLACEHOLDER_VARIANTS = ['Normal', 'Hyperspace', 'Hyperspace Foil']

const ASPECT_ORDER = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Villainy', 'Heroism']
const MAIN_DECK_VARIANTS = ['Normal', 'Hyperspace', 'Hyperspace Foil']
const LEADER_BASE_VARIANTS = ['Normal', 'Hyperspace']

const PRIMARY_PRIMARY_PAIRS = [
  ['Vigilance', 'Command'],
  ['Vigilance', 'Aggression'],
  ['Vigilance', 'Cunning'],
  ['Command', 'Aggression'],
  ['Command', 'Cunning'],
  ['Aggression', 'Cunning'],
]

type AshPlaceholderGroup = 'leader' | 'base' | 'main'

export interface AshCatalogCard {
  id: string
  cardId?: string | null
  number?: string | null
  name?: string
  subtitle?: string | null
  set?: string
  rarity?: string
  type?: string
  aspects?: string[]
  traits?: string[]
  arenas?: string[]
  cost?: number | null
  power?: number | null
  hp?: number | null
  frontText?: string | null
  backText?: string | null
  epicAction?: string | null
  keywords?: string[]
  artist?: string | null
  unique?: boolean
  doubleSided?: boolean
  variantType?: string
  marketPrice?: number | null
  lowPrice?: number | null
  isLeader?: boolean
  isBase?: boolean
  isFoil?: boolean
  isHyperspace?: boolean
  isShowcase?: boolean
  isPrestige?: boolean
  prestigeTier?: string | null
  imageUrl?: string | null
  backImageUrl?: string | null
  isPlaceholder?: boolean
  spoilerStatus?: 'placeholder' | 'spoiled'
  sourceId?: string | null
  placeholderVersion?: string
  placeholderKind?: 'bucket-slot'
  placeholderGroup?: AshPlaceholderGroup
  placeholderBucketId?: string
  placeholderBucketLabel?: string
  placeholderSlotIndex?: number
  placeholderTargetCount?: number
  placeholderRemainingCount?: number
  placeholderConfidence?: string
  inferredFields?: string[]
  [key: string]: unknown
}

interface BucketDefinition {
  group: AshPlaceholderGroup
  rarity: string
  aspects: string[]
  count: number
  type?: string
}

interface VariantBucketTarget extends BucketDefinition {
  variantType: string
  bucketId: string
  label: string
}

export interface AshBucketContradiction {
  bucketId: string
  targetCount: number
  realCount: number
}

export interface AshPlaceholderMetadata {
  version: string
  expectedNormalSlots: number
  mainDeckMulticolorSlots: number
  primaryPrimaryLeaderSlots: number
  variants: string[]
  bucketCount: number
  realCardCount: number
  placeholderCardCount: number
  spoiledNormalCount: number
  status: 'valid' | 'invalid'
  contradictions: AshBucketContradiction[]
  generatedAt: string
}

export interface AshPlaceholderMergeResult {
  cards: AshCatalogCard[]
  metadata: AshPlaceholderMetadata
}

function sortAspects(aspects: string[] = []): string[] {
  return [...aspects].sort((a, b) => ASPECT_ORDER.indexOf(a) - ASPECT_ORDER.indexOf(b))
}

export function getAshAspectKey(aspects: string[] = []): string {
  const sorted = sortAspects(aspects)
  return sorted.length > 0 ? sorted.join('+') : 'Neutral'
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function variantSlug(variantType: string): string {
  return slug(variantType || 'Normal')
}

function bucketLabel(target: BucketDefinition): string {
  const aspect = getAshAspectKey(target.aspects)
  if (target.group === 'leader') return `${target.rarity} Leader ${aspect}`
  if (target.group === 'base') return `${target.rarity} Base ${aspect}`
  return `${target.rarity} ${aspect}`
}

export function getAshBucketId(target: {
  group: AshPlaceholderGroup
  rarity: string
  aspects?: string[]
  variantType?: string
}): string {
  return [
    'ash-slot',
    variantSlug(target.variantType || 'Normal'),
    target.group,
    slug(target.rarity),
    slug(getAshAspectKey(target.aspects || [])),
  ].join(':')
}

function addCounts(
  definitions: BucketDefinition[],
  aspectLabel: string,
  counts: Record<string, number>
): void {
  const aspects = aspectLabel === 'Neutral' ? [] : aspectLabel.split('+')
  for (const rarity of ['Common', 'Uncommon', 'Rare', 'Legendary', 'Special']) {
    const count = counts[rarity] || 0
    if (count > 0) {
      definitions.push({
        group: 'main',
        rarity,
        aspects,
        count,
        type: 'Unknown',
      })
    }
  }
}

function buildLeaderBuckets(): BucketDefinition[] {
  const definitions: BucketDefinition[] = []
  const commonLeaderAspects = [
    ['Vigilance', 'Villainy'],
    ['Vigilance', 'Heroism'],
    ['Command', 'Villainy'],
    ['Command', 'Heroism'],
    ['Aggression', 'Villainy'],
    ['Aggression', 'Heroism'],
    ['Cunning', 'Villainy'],
    ['Cunning', 'Heroism'],
  ]
  const rareLeaderAspects = [
    ['Vigilance', 'Villainy'],
    ['Vigilance', 'Heroism'],
    ['Command', 'Villainy'],
    ['Command', 'Aggression'],
    ['Aggression', 'Villainy'],
    ['Aggression', 'Heroism'],
    ['Cunning', 'Heroism'],
    ['Vigilance', 'Cunning'],
  ]
  const specialLeaderAspects = [
    ['Command', 'Heroism'],
    ['Cunning', 'Villainy'],
  ]

  for (const aspects of commonLeaderAspects) {
    definitions.push({ group: 'leader', rarity: 'Common', aspects, count: 1, type: 'Leader' })
  }
  for (const aspects of rareLeaderAspects) {
    definitions.push({ group: 'leader', rarity: 'Rare', aspects, count: 1, type: 'Leader' })
  }
  for (const aspects of specialLeaderAspects) {
    definitions.push({ group: 'leader', rarity: 'Special', aspects, count: 1, type: 'Leader' })
  }

  return definitions
}

function buildBaseBuckets(): BucketDefinition[] {
  return ['Vigilance', 'Command', 'Aggression', 'Cunning'].map(aspect => ({
    group: 'base',
    rarity: 'Common',
    aspects: [aspect],
    count: 2,
    type: 'Base',
  }))
}

function buildMainDeckBuckets(): BucketDefinition[] {
  const definitions: BucketDefinition[] = []

  addCounts(definitions, 'Vigilance', { Common: 14, Uncommon: 6, Rare: 4, Legendary: 1 })
  addCounts(definitions, 'Command', { Common: 14, Uncommon: 6, Rare: 3, Legendary: 2 })
  addCounts(definitions, 'Aggression', { Common: 14, Uncommon: 6, Rare: 5 })
  addCounts(definitions, 'Cunning', { Common: 14, Uncommon: 6, Rare: 4, Legendary: 1 })

  addCounts(definitions, 'Vigilance+Villainy', { Common: 3, Uncommon: 3, Rare: 2, Legendary: 1, Special: 2 })
  addCounts(definitions, 'Vigilance+Heroism', { Common: 3, Uncommon: 3, Rare: 3, Legendary: 1 })
  addCounts(definitions, 'Command+Villainy', { Common: 3, Uncommon: 3, Rare: 3, Special: 2 })
  addCounts(definitions, 'Command+Heroism', { Common: 3, Uncommon: 3, Rare: 2, Legendary: 1, Special: 2 })
  addCounts(definitions, 'Aggression+Villainy', { Common: 3, Uncommon: 3, Rare: 3, Legendary: 2 })
  addCounts(definitions, 'Aggression+Heroism', { Common: 3, Uncommon: 3, Rare: 2, Legendary: 2 })
  addCounts(definitions, 'Cunning+Villainy', { Common: 3, Uncommon: 2, Rare: 3, Legendary: 2 })
  addCounts(definitions, 'Cunning+Heroism', { Common: 3, Uncommon: 2, Rare: 3, Legendary: 2, Special: 2 })

  for (const aspects of PRIMARY_PRIMARY_PAIRS) {
    addCounts(definitions, aspects.join('+'), { Uncommon: 1, Rare: 1 })
  }

  const threeAspectRarities = ['Uncommon', 'Uncommon', 'Rare', 'Rare', 'Legendary', 'Legendary']
  for (let i = 0; i < PRIMARY_PRIMARY_PAIRS.length; i++) {
    const pair = PRIMARY_PRIMARY_PAIRS[i]
    const rarity = threeAspectRarities[i]
    definitions.push({ group: 'main', rarity, aspects: [...pair, 'Villainy'], count: 1, type: 'Unknown' })
    definitions.push({ group: 'main', rarity, aspects: [...pair, 'Heroism'], count: 1, type: 'Unknown' })
  }

  addCounts(definitions, 'Villainy', { Common: 7, Uncommon: 2, Rare: 1, Legendary: 1 })
  addCounts(definitions, 'Heroism', { Common: 7, Uncommon: 2, Rare: 2 })
  addCounts(definitions, 'Neutral', { Common: 6 })

  return definitions
}

export function getAshNormalBucketDefinitions(): BucketDefinition[] {
  return [
    ...buildLeaderBuckets(),
    ...buildBaseBuckets(),
    ...buildMainDeckBuckets(),
  ]
}

export function getAshVariantBucketTargets(): VariantBucketTarget[] {
  const targets: VariantBucketTarget[] = []
  for (const definition of getAshNormalBucketDefinitions()) {
    const variants = definition.group === 'main' ? MAIN_DECK_VARIANTS : LEADER_BASE_VARIANTS
    for (const variantType of variants) {
      const target = {
        ...definition,
        variantType,
        bucketId: getAshBucketId({ ...definition, variantType }),
        label: bucketLabel(definition),
      }
      targets.push(target)
    }
  }
  return targets
}

function isRealAshCard(card: AshCatalogCard): boolean {
  return card.set === ASH_SET_CODE && card.isPlaceholder !== true
}

function normalizeRealAshCard(card: AshCatalogCard): AshCatalogCard {
  return {
    ...card,
    set: ASH_SET_CODE,
    variantType: card.variantType || 'Normal',
    isPlaceholder: false,
    spoilerStatus: 'spoiled',
  }
}

function placeholderName(target: VariantBucketTarget, slotIndex: number): string {
  const treatment = target.variantType === 'Normal' ? '' : `${target.variantType} `
  return `Unknown ASH ${treatment}${target.label} Slot ${slotIndex}`
}

function createPlaceholderCard(target: VariantBucketTarget, slotIndex: number, remainingCount: number): AshCatalogCard {
  const isLeader = target.group === 'leader'
  const isBase = target.group === 'base'
  const isHyperspace = target.variantType === 'Hyperspace' || target.variantType === 'Hyperspace Foil'
  const isFoil = target.variantType === 'Hyperspace Foil'
  const id = `${target.bucketId}:${String(slotIndex).padStart(3, '0')}`

  return {
    id,
    cardId: null,
    number: null,
    name: placeholderName(target, slotIndex),
    subtitle: null,
    set: ASH_SET_CODE,
    rarity: target.rarity,
    type: target.type || 'Unknown',
    aspects: sortAspects(target.aspects),
    traits: [],
    arenas: [],
    cost: null,
    power: null,
    hp: null,
    frontText: null,
    backText: null,
    epicAction: null,
    keywords: [],
    artist: null,
    unique: false,
    doubleSided: false,
    variantType: target.variantType,
    marketPrice: null,
    lowPrice: null,
    isLeader,
    isBase,
    isFoil,
    isHyperspace,
    isShowcase: false,
    isPrestige: false,
    prestigeTier: null,
    imageUrl: null,
    backImageUrl: null,
    isPlaceholder: true,
    spoilerStatus: 'placeholder',
    sourceId: null,
    placeholderVersion: ASH_PLACEHOLDER_VERSION,
    placeholderKind: 'bucket-slot',
    placeholderGroup: target.group,
    placeholderBucketId: target.bucketId,
    placeholderBucketLabel: target.label,
    placeholderSlotIndex: slotIndex,
    placeholderTargetCount: target.count,
    placeholderRemainingCount: remainingCount,
    placeholderConfidence: 'rarity-aspect-bucket-v0',
    inferredFields: ['rarity', 'aspects', 'variantType'],
  }
}

export function getAshCardBucketId(card: AshCatalogCard): string | null {
  if (card.set !== ASH_SET_CODE) return null
  const variantType = card.variantType || 'Normal'
  const group = card.isLeader || card.type === 'Leader'
    ? 'leader'
    : card.isBase || card.type === 'Base'
      ? 'base'
      : 'main'

  return getAshBucketId({
    group,
    rarity: card.rarity || 'Common',
    aspects: card.aspects || [],
    variantType,
  })
}

export function mergeAshPlaceholderCatalog(
  inputCards: AshCatalogCard[],
  now: Date = new Date()
): AshPlaceholderMergeResult {
  const cardsWithoutAshPlaceholders = inputCards.filter(card =>
    !(card.set === ASH_SET_CODE && card.isPlaceholder === true)
  )

  const normalizedCards = cardsWithoutAshPlaceholders.map(card =>
    card.set === ASH_SET_CODE ? normalizeRealAshCard(card) : card
  )
  const realAshCards = normalizedCards.filter(isRealAshCard)

  const targets = getAshVariantBucketTargets()
  const targetByBucket = new Map(targets.map(target => [target.bucketId, target]))
  const realByBucket = new Map<string, AshCatalogCard[]>()

  for (const card of realAshCards) {
    const bucketId = getAshCardBucketId(card)
    if (!bucketId) continue
    if (!realByBucket.has(bucketId)) realByBucket.set(bucketId, [])
    realByBucket.get(bucketId)!.push(card)
  }

  // Once the Normal variant of the set is fully spoiled (real Normal count
  // reaches the expected slot total), drop ALL placeholders — Normal, Hyperspace,
  // Hyperspace Foil. The catalog's job is to fill in the unknowns; when nothing
  // is unknown anymore, the catalog should disappear entirely.
  const realNormalCount = realAshCards.filter(
    card => (card.variantType || 'Normal') === 'Normal',
  ).length
  const isFullySpoiled = realNormalCount >= ASH_EXPECTED_NORMAL_SLOTS

  const placeholders: AshCatalogCard[] = []

  // Overfull buckets (realCount > target.count) are accepted silently. The
  // placeholder catalog is a best-effort prediction of set composition; the
  // real card list always wins. We simply emit zero placeholders for the
  // overflowing bucket and move on — no contradiction, no error status.
  if (!isFullySpoiled) {
    for (const target of targets) {
      const realCount = realByBucket.get(target.bucketId)?.length || 0
      const placeholderCount = Math.max(0, target.count - realCount)
      for (let slotIndex = 1; slotIndex <= placeholderCount; slotIndex++) {
        placeholders.push(createPlaceholderCard(target, slotIndex, placeholderCount))
      }
    }
  }

  const mergedCards = [...normalizedCards, ...placeholders]
  const ashCards = mergedCards.filter(card => card.set === ASH_SET_CODE)
  const metadata: AshPlaceholderMetadata = {
    version: ASH_PLACEHOLDER_VERSION,
    expectedNormalSlots: ASH_EXPECTED_NORMAL_SLOTS,
    mainDeckMulticolorSlots: ASH_MAIN_DECK_MULTICOLOR_SLOTS,
    primaryPrimaryLeaderSlots: ASH_PRIMARY_PRIMARY_LEADER_SLOTS,
    variants: ASH_PLACEHOLDER_VARIANTS,
    bucketCount: targets.length,
    realCardCount: ashCards.filter(card => card.isPlaceholder !== true).length,
    placeholderCardCount: ashCards.filter(card => card.isPlaceholder === true).length,
    spoiledNormalCount: ashCards.filter(card => card.variantType === 'Normal' && card.isPlaceholder !== true).length,
    status: 'valid',
    contradictions: [],
    generatedAt: now.toISOString(),
  }

  return { cards: mergedCards, metadata }
}

export function applyAshMetadata(
  metadata: Record<string, any> | null,
  ashMetadata: AshPlaceholderMetadata
): Record<string, any> | null {
  if (!metadata) return metadata

  const sets = Array.isArray(metadata.sets) ? metadata.sets : []
  const updatedSets = sets.map((set: Record<string, any>) => {
    if (set.code !== ASH_SET_CODE) return set
    return {
      ...set,
      cardCount: ashMetadata.realCardCount + ashMetadata.placeholderCardCount,
      realCardCount: ashMetadata.realCardCount,
      placeholderCardCount: ashMetadata.placeholderCardCount,
      spoiledNormalCount: ashMetadata.spoiledNormalCount,
      placeholderVersion: ashMetadata.version,
      placeholderStatus: ashMetadata.status,
    }
  })

  if (!updatedSets.some((set: Record<string, any>) => set.code === ASH_SET_CODE)) {
    updatedSets.push({
      code: ASH_SET_CODE,
      name: 'Ashes of the Empire',
      cardCount: ashMetadata.realCardCount + ashMetadata.placeholderCardCount,
      realCardCount: ashMetadata.realCardCount,
      placeholderCardCount: ashMetadata.placeholderCardCount,
      spoiledNormalCount: ashMetadata.spoiledNormalCount,
      placeholderVersion: ashMetadata.version,
      placeholderStatus: ashMetadata.status,
    })
  }

  return {
    ...metadata,
    sets: updatedSets,
    ashPlaceholderCatalog: ashMetadata,
  }
}
