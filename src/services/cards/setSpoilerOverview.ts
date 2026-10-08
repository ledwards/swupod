// @ts-nocheck
import {
  ASH_SET_CODE,
  getAshAspectKey,
  getAshCardBucketId,
  getAshVariantBucketTargets,
} from './ashPlaceholderCatalog'

const SET_NAMES: Record<string, string> = {
  SOR: 'Spark of Rebellion',
  SHD: 'Shadows of the Galaxy',
  TWI: 'Twilight of the Republic',
  JTL: 'Jump to Lightspeed',
  LOF: 'Legends of the Force',
  SEC: 'Secrets of Power',
  LAW: 'A Lawless Time',
  ASH: 'Ashes of the Empire',
}

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Special']
const GROUP_ORDER = ['leader', 'base', 'main']
const VARIANT_ORDER = ['Normal', 'Foil', 'Hyperspace', 'Hyperspace Foil', 'Showcase']

function sortByOrder(order: string[], a: string, b: string): number {
  const aIndex = order.indexOf(a)
  const bIndex = order.indexOf(b)
  if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
  if (aIndex === -1) return 1
  if (bIndex === -1) return -1
  return aIndex - bIndex
}

function getGroup(card: Record<string, any>): string {
  if (card.placeholderGroup) return card.placeholderGroup
  if (card.isLeader || card.type === 'Leader') return 'leader'
  if (card.isBase || card.type === 'Base') return 'base'
  return 'main'
}

function getAspectKey(aspects: string[] = []): string {
  return getAshAspectKey(aspects)
}

function getVariantType(card: Record<string, any>): string {
  return card.variantType || 'Normal'
}

function getGenericBucketId(card: Record<string, any>): string {
  return [
    card.set || 'SET',
    getVariantType(card),
    getGroup(card),
    card.rarity || 'Unknown',
    getAspectKey(card.aspects || []),
  ].join(':')
}

function getBucketId(card: Record<string, any>): string {
  if (card.placeholderBucketId) return card.placeholderBucketId
  if (card.set === ASH_SET_CODE) return getAshCardBucketId(card) || getGenericBucketId(card)
  return getGenericBucketId(card)
}

function groupLabel(group: string): string {
  if (group === 'leader') return 'Leader'
  if (group === 'base') return 'Base'
  return 'Main Deck'
}

function bucketLabel(bucket: Record<string, any>): string {
  const aspect = bucket.aspectKey === 'Neutral' ? 'Neutral' : bucket.aspectKey
  if (bucket.group === 'leader') return `${bucket.rarity} Leader ${aspect}`
  if (bucket.group === 'base') return `${bucket.rarity} Base ${aspect}`
  return `${bucket.rarity} ${aspect}`
}

function emptyBucket(target: Record<string, any>): Record<string, any> {
  return {
    bucketId: target.bucketId,
    label: target.label || bucketLabel(target),
    group: target.group,
    groupLabel: groupLabel(target.group),
    rarity: target.rarity,
    aspects: target.aspects || [],
    aspectKey: getAspectKey(target.aspects || []),
    variantType: target.variantType || 'Normal',
    targetCount: target.count || 0,
    realCount: 0,
    placeholderCount: 0,
    totalCount: 0,
  }
}

function createBucketFromCard(card: Record<string, any>): Record<string, any> {
  const group = getGroup(card)
  const aspects = card.aspects || []
  const bucket = {
    bucketId: getBucketId(card),
    group,
    groupLabel: groupLabel(group),
    rarity: card.rarity || 'Unknown',
    aspects,
    aspectKey: getAspectKey(aspects),
    variantType: getVariantType(card),
    targetCount: card.placeholderTargetCount || 0,
    realCount: 0,
    placeholderCount: 0,
    totalCount: 0,
  }

  return {
    ...bucket,
    label: card.placeholderBucketLabel || bucketLabel(bucket),
  }
}

function catalogCard(card: Record<string, any>): Record<string, any> {
  const group = getGroup(card)
  const aspects = card.aspects || []
  const bucketId = getBucketId(card)

  return {
    id: card.id,
    name: card.name || card.placeholderBucketLabel || 'Unknown card',
    cardId: card.cardId || null,
    number: card.number || null,
    set: card.set,
    rarity: card.rarity || 'Unknown',
    type: card.type || 'Unknown',
    aspects,
    aspectKey: getAspectKey(aspects),
    group,
    groupLabel: groupLabel(group),
    variantType: getVariantType(card),
    imageUrl: card.imageUrl || null,
    isPlaceholder: card.isPlaceholder === true,
    spoilerStatus: card.isPlaceholder === true ? 'placeholder' : 'spoiled',
    bucketId,
    placeholderBucketLabel: card.placeholderBucketLabel || null,
    placeholderSlotIndex: card.placeholderSlotIndex || null,
    placeholderTargetCount: card.placeholderTargetCount || null,
    placeholderRemainingCount: card.placeholderRemainingCount || null,
  }
}

function sortCatalogCards(a: Record<string, any>, b: Record<string, any>): number {
  return sortByOrder(VARIANT_ORDER, a.variantType, b.variantType) ||
    sortByOrder(GROUP_ORDER, a.group, b.group) ||
    sortByOrder(RARITY_ORDER, a.rarity, b.rarity) ||
    a.aspectKey.localeCompare(b.aspectKey) ||
    Number(a.placeholderSlotIndex || 0) - Number(b.placeholderSlotIndex || 0) ||
    String(a.number || '').localeCompare(String(b.number || '')) ||
    a.name.localeCompare(b.name)
}

function sortBuckets(a: Record<string, any>, b: Record<string, any>): number {
  return sortByOrder(VARIANT_ORDER, a.variantType, b.variantType) ||
    sortByOrder(GROUP_ORDER, a.group, b.group) ||
    sortByOrder(RARITY_ORDER, a.rarity, b.rarity) ||
    a.aspectKey.localeCompare(b.aspectKey)
}

function rollupBuckets(buckets: Record<string, any>[], key: 'rarity' | 'aspectKey' | 'group'): Record<string, any>[] {
  const rows = new Map<string, Record<string, any>>()

  for (const bucket of buckets) {
    const rowKey = bucket[key]
    if (!rows.has(rowKey)) {
      rows.set(rowKey, {
        key: rowKey,
        label: key === 'group' ? groupLabel(rowKey) : rowKey,
        targetCount: 0,
        realCount: 0,
        placeholderCount: 0,
        totalCount: 0,
      })
    }

    const row = rows.get(rowKey)!
    row.targetCount += bucket.targetCount
    row.realCount += bucket.realCount
    row.placeholderCount += bucket.placeholderCount
    row.totalCount += bucket.totalCount
  }

  return Array.from(rows.values()).map(row => ({
    ...row,
    progressPct: row.targetCount > 0 ? Math.round((row.realCount / row.targetCount) * 100) : 100,
  }))
}

function sortRollupRows(kind: 'rarity' | 'aspectKey' | 'group', rows: Record<string, any>[]): Record<string, any>[] {
  return [...rows].sort((a, b) => {
    if (kind === 'rarity') return sortByOrder(RARITY_ORDER, a.key, b.key)
    if (kind === 'group') return sortByOrder(GROUP_ORDER, a.key, b.key)
    if (a.placeholderCount !== b.placeholderCount) return b.placeholderCount - a.placeholderCount
    if (a.targetCount !== b.targetCount) return b.targetCount - a.targetCount
    return a.label.localeCompare(b.label)
  })
}

export function buildSetSpoilerOverview(
  setCode: string,
  inputCards: Record<string, any>[],
  metadata: Record<string, any> = {}
): Record<string, any> {
  const normalizedSetCode = setCode.toUpperCase()
  const setCards = inputCards.filter(card => card.set === normalizedSetCode)
  const setMetadata = Array.isArray(metadata.sets)
    ? metadata.sets.find((set: Record<string, any>) => set.code === normalizedSetCode)
    : null
  const ashMetadata = normalizedSetCode === ASH_SET_CODE ? metadata.ashPlaceholderCatalog || null : null
  const bucketMap = new Map<string, Record<string, any>>()

  if (normalizedSetCode === ASH_SET_CODE) {
    for (const target of getAshVariantBucketTargets() as Record<string, any>[]) {
      bucketMap.set(target.bucketId, emptyBucket(target))
    }
  }

  const cards = setCards.map(catalogCard).sort(sortCatalogCards)

  for (const card of cards) {
    if (!bucketMap.has(card.bucketId)) {
      bucketMap.set(card.bucketId, createBucketFromCard(card))
    }

    const bucket = bucketMap.get(card.bucketId)!
    bucket.totalCount += 1
    if (card.isPlaceholder) {
      bucket.placeholderCount += 1
      bucket.targetCount = Math.max(bucket.targetCount, card.placeholderTargetCount || 0)
    } else {
      bucket.realCount += 1
    }
    bucket.targetCount = Math.max(bucket.targetCount, bucket.totalCount)
  }

  const buckets = Array.from(bucketMap.values()).sort(sortBuckets)
  const variants = Array.from(new Set([
    ...(Array.isArray(ashMetadata?.variants) ? ashMetadata.variants : []),
    ...cards.map(card => card.variantType),
    ...buckets.map(bucket => bucket.variantType),
  ])).sort((a, b) => sortByOrder(VARIANT_ORDER, a, b))

  const rollupsByVariant = Object.fromEntries(variants.map(variantType => {
    const variantBuckets = buckets.filter(bucket => bucket.variantType === variantType)
    return [
      variantType,
      {
        byRarity: sortRollupRows('rarity', rollupBuckets(variantBuckets, 'rarity')),
        byAspect: sortRollupRows('aspectKey', rollupBuckets(variantBuckets, 'aspectKey')),
        byGroup: sortRollupRows('group', rollupBuckets(variantBuckets, 'group')),
      },
    ]
  }))

  const variantSummaries = variants.map(variantType => {
    const variantBuckets = buckets.filter(bucket => bucket.variantType === variantType)
    const targetCount = variantBuckets.reduce((sum, bucket) => sum + bucket.targetCount, 0)
    const realCount = variantBuckets.reduce((sum, bucket) => sum + bucket.realCount, 0)
    const placeholderCount = variantBuckets.reduce((sum, bucket) => sum + bucket.placeholderCount, 0)

    return {
      variantType,
      targetCount,
      realCount,
      placeholderCount,
      totalCount: realCount + placeholderCount,
      progressPct: targetCount > 0 ? Math.round((realCount / targetCount) * 100) : 100,
    }
  })

  const realCount = cards.filter(card => !card.isPlaceholder).length
  const placeholderCount = cards.filter(card => card.isPlaceholder).length
  const normalSummary = variantSummaries.find(summary => summary.variantType === 'Normal') || variantSummaries[0] || {
    targetCount: 0,
    realCount: 0,
    placeholderCount: 0,
    totalCount: 0,
    progressPct: 0,
  }

  return {
    setCode: normalizedSetCode,
    setName: setMetadata?.name || SET_NAMES[normalizedSetCode] || normalizedSetCode,
    cards,
    buckets,
    variants,
    variantSummaries,
    rollupsByVariant,
    totals: {
      cardCount: cards.length,
      realCount,
      placeholderCount,
      normalTargetCount: normalSummary.targetCount,
      normalRealCount: normalSummary.realCount,
      normalPlaceholderCount: normalSummary.placeholderCount,
      normalProgressPct: normalSummary.progressPct,
    },
    metadata: {
      lastUpdated: metadata.lastUpdated || null,
      lastProcessed: metadata.lastProcessed || null,
      placeholderVersion: setMetadata?.placeholderVersion || ashMetadata?.version || null,
      placeholderStatus: setMetadata?.placeholderStatus || ashMetadata?.status || null,
      contradictions: ashMetadata?.contradictions || [],
    },
  }
}
