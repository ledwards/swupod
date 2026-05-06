// @ts-nocheck
/**
 * ArenaCardArea — shared card rendering for both Pool and Deck in arena view.
 *
 * Single source of truth for the 4 sort/group modes:
 * - 'cost': 8 cost columns (1..7, 8+) split by Unit/Non-Unit (the playmat metaphor).
 * - 'aspect': grouped blocks by aspect combo.
 * - 'type': grouped blocks by type.
 * - 'default': flat sorted grid.
 *
 * Used by ArenaPoolSection and ArenaDeckSection so the two areas look identical
 * for the same `sortOption`. The owner sections only differ in (a) which cards they pass in
 * and (b) what extra UI they render around the area (e.g. aspect-combo filters on Pool).
 */

import { useMemo, useCallback, type MouseEvent } from 'react'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'
import { ArenaCardStack } from './ArenaCardStack'
import { ResizableCard } from './ResizableCard'
import { GroupHeader } from './GroupHeader'
import { calculateAspectPenalty } from '../../services/cards/aspectPenalties'
import { getAspectSortKey, getTypeOrder } from '../../services/cards/cardSorting'
import { sortGroupKeys, createGetGroupKey, createGroupCardSortFn } from '../../utils/cardSort'
import { getAspectKey as getAspectKeyUtil } from '../../utils/aspectCombinations'
import CostIcon from '../CostIcon'
import type { CardData } from '../Card'
import type { SortOption } from './SortControls'

interface CardPosition {
  card: CardData
  section: string
  visible: boolean
  enabled?: boolean
  [key: string]: unknown
}

export interface ArenaCardAreaCardEntry {
  cardId: string
  position: CardPosition
}

interface GroupedCardEntry {
  cardId: string
  cardIds: string[]
  position: CardPosition
  quantity: number
}

export interface ArenaCardAreaProps {
  cards: ArenaCardAreaCardEntry[]
  sortOption: SortOption
  density: 'small' | 'medium' | 'large'
  showAspectPenalties: boolean
  emptyMessage?: string
  onCardClick?: (cardId: string, e: MouseEvent) => void
  onCardMouseEnter?: (cardId: string, card: CardData, e: MouseEvent) => void
  onCardMouseLeave?: () => void
  onCardTouchStart?: (cardId: string, card: CardData) => void
  onCardTouchEnd?: () => void
}

const COST_BUCKETS = ['1', '2', '3', '4', '5', '6', '7', '8+']

const PRIMARY_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']

// Sorted combo key (e.g. "Vigilance|Villainy") so two cards with the same aspect set hash identically.
const comboKeyFor = (aspects: string[] | undefined): string => {
  if (!aspects || aspects.length === 0) return 'Neutral'
  return [...aspects].sort().join('|')
}

const isMultiPrimaryComboKey = (key: string): boolean => {
  if (key === 'Neutral') return false
  const parts = key.split('|')
  const primaries = new Set(parts.filter(a => PRIMARY_ASPECTS.includes(a)))
  return primaries.size >= 2
}

const ASPECT_SORT_ORDER: Record<string, number> = {
  'Vigilance': 0,
  'Command': 1,
  'Aggression': 2,
  'Cunning': 3,
  'Villainy': 4,
  'Heroism': 5,
}

function getAspectSortValue(card: CardData): number {
  const aspects = card.aspects || []
  if (aspects.length === 0) return 999
  let best = 999
  for (const a of aspects) {
    const val = ASPECT_SORT_ORDER[a]
    if (val !== undefined && val < best) best = val
  }
  return best
}

const getAspectSymbol = (aspect: string, size = 'medium') => {
  const sizeMap: Record<string, number> = { small: 16, medium: 20, large: 24 }
  const px = sizeMap[size] ?? 20
  return (
    <img
      src={`/icons/${aspect.toLowerCase()}.png`}
      alt={aspect}
      style={{ width: `${px}px`, height: `${px}px`, display: 'inline-block', verticalAlign: 'middle' }}
    />
  )
}

export function ArenaCardArea({
  cards,
  sortOption,
  density,
  showAspectPenalties,
  emptyMessage = 'No cards.',
  onCardClick,
  onCardMouseEnter,
  onCardMouseLeave,
  onCardTouchStart,
  onCardTouchEnd,
}: ArenaCardAreaProps) {
  const {
    leaderCard,
    baseCard,
    hoveredCard,
    selectedCards,
    toggleCardSection,
    cardMatchesFilters,
  } = useDeckBuilder()

  // Effective cost (with optional aspect penalty)
  const getEffectiveCost = useCallback((card: CardData): number => {
    const baseCost = card.cost ?? 0
    if (!showAspectPenalties || !leaderCard || !baseCard) return baseCost
    return baseCost + calculateAspectPenalty(card, leaderCard, baseCard)
  }, [showAspectPenalties, leaderCard, baseCard])

  const getCostBucket = useCallback((card: CardData): string => {
    const effectiveCost = getEffectiveCost(card)
    if (effectiveCost >= 8) return '8+'
    if (effectiveCost < 1) return '1'
    return String(effectiveCost)
  }, [getEffectiveCost])

  const isUnit = (card: CardData): boolean => card.type === 'Unit'

  // Cost-mode buckets (Unit / Non-Unit per cost column)
  const cardsByBucket = useMemo(() => {
    const buckets: Record<string, { units: GroupedCardEntry[]; nonUnits: GroupedCardEntry[] }> = {}
    COST_BUCKETS.forEach(b => { buckets[b] = { units: [], nonUnits: [] } })

    const tempBuckets: Record<string, { units: ArenaCardAreaCardEntry[]; nonUnits: ArenaCardAreaCardEntry[] }> = {}
    COST_BUCKETS.forEach(b => { tempBuckets[b] = { units: [], nonUnits: [] } })

    cards.forEach(entry => {
      const bucket = getCostBucket(entry.position.card)
      if (!tempBuckets[bucket]) return
      if (isUnit(entry.position.card)) tempBuckets[bucket].units.push(entry)
      else tempBuckets[bucket].nonUnits.push(entry)
    })

    const groupByName = (entries: ArenaCardAreaCardEntry[]): GroupedCardEntry[] => {
      const grouped = new Map<string, ArenaCardAreaCardEntry[]>()
      entries.forEach(e => {
        const name = e.position.card.name || e.cardId
        if (!grouped.has(name)) grouped.set(name, [])
        grouped.get(name)!.push(e)
      })
      const result: GroupedCardEntry[] = []
      grouped.forEach(es => {
        result.push({
          cardId: es[0].cardId,
          cardIds: es.map(e => e.cardId),
          position: es[0].position,
          quantity: es.length,
        })
      })
      result.sort((a, b) => {
        const A = a.position.card, B = b.position.card
        const cA = A.cost ?? 0, cB = B.cost ?? 0
        if (cA !== cB) return cA - cB
        const aA = getAspectSortValue(A), aB = getAspectSortValue(B)
        if (aA !== aB) return aA - aB
        return (A.name || '').localeCompare(B.name || '')
      })
      return result
    }

    Object.keys(tempBuckets).forEach(b => {
      buckets[b].units = groupByName(tempBuckets[b].units)
      buckets[b].nonUnits = groupByName(tempBuckets[b].nonUnits)
    })
    return buckets
  }, [cards, getCostBucket])

  // Default-mode flat sort
  const sortedFlatCards = useMemo(() => {
    return [...cards].sort((a, b) => {
      const A = a.position.card, B = b.position.card
      const ka = getAspectSortKey(A), kb = getAspectSortKey(B)
      const cmp = ka.localeCompare(kb)
      if (cmp !== 0) return cmp
      const tA = getTypeOrder(A.type || ''), tB = getTypeOrder(B.type || '')
      if (tA !== tB) return tA - tB
      const cA = A.cost ?? 0, cB = B.cost ?? 0
      if (cA !== cB) return cA - cB
      return (A.name || '').localeCompare(B.name || '')
    })
  }, [cards])

  // Aspect/type-mode grouped blocks
  const groupedBlocks = useMemo(() => {
    if (sortOption !== 'aspect' && sortOption !== 'type') return null
    const getGroupKey = createGetGroupKey(sortOption, {
      showAspectPenalties,
      leaderCard,
      baseCard,
      calculateAspectPenalty,
      getAspectKey: getAspectKeyUtil,
    })
    const groups: Record<string, ArenaCardAreaCardEntry[]> = {}
    cards.forEach(e => {
      const key = getGroupKey(e.position.card)
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    })
    const cardSortFn = createGroupCardSortFn(sortOption, getAspectSortKey)
    Object.keys(groups).forEach(key => groups[key].sort(cardSortFn))
    const sortedKeys = sortGroupKeys(Object.keys(groups), sortOption, '8+')
    return { groups, sortedKeys }
  }, [cards, sortOption, showAspectPenalties, leaderCard, baseCard])

  const calculatePenalty = useCallback((card: CardData): number => {
    if (!leaderCard || !baseCard) return 0
    return calculateAspectPenalty(card, leaderCard, baseCard)
  }, [leaderCard, baseCard])

  const handleCardClick = useCallback((cardId: string, e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.shiftKey) toggleCardSection(cardId)
    onCardClick?.(cardId, e)
  }, [toggleCardSection, onCardClick])

  const renderFlatCard = useCallback((entry: ArenaCardAreaCardEntry) => {
    const { cardId, position } = entry
    const card = position.card
    const isSelected = selectedCards.has(cardId)
    const isHovered = hoveredCard === cardId
    const penalty = showAspectPenalties ? calculatePenalty(card) : 0
    const filteredOut = cardMatchesFilters ? !cardMatchesFilters(card) : false

    const cardElement = (
      <ResizableCard
        card={card}
        selected={isSelected}
        hovered={isHovered}
        filteredOut={filteredOut}
        showPenalty={showAspectPenalties && penalty > 0}
        penaltyAmount={penalty}
        onClick={(e) => handleCardClick(cardId, e)}
        onMouseEnter={(e) => onCardMouseEnter?.(cardId, card, e)}
        onMouseLeave={onCardMouseLeave}
        onTouchStart={() => onCardTouchStart?.(cardId, card)}
        onTouchEnd={() => onCardTouchEnd?.()}
      />
    )
    if (density === 'large') return <div key={cardId}>{cardElement}</div>
    return (
      <div key={cardId} className={`card-density-wrapper card-density-wrapper--${density}`}>
        {cardElement}
      </div>
    )
  }, [
    selectedCards, hoveredCard, showAspectPenalties, calculatePenalty,
    handleCardClick, onCardMouseEnter, onCardMouseLeave, onCardTouchStart, onCardTouchEnd,
    density, cardMatchesFilters,
  ])

  // Cost columns (matches ArenaDeckSection's existing playmat layout)
  const renderCostColumns = () => (
    <div className="arena-cost-columns">
      {COST_BUCKETS.map(bucket => {
        const { units, nonUnits } = cardsByBucket[bucket]
        const unitsQty = units.reduce((s, e) => s + (e.quantity || 1), 0)
        const nonUnitsQty = nonUnits.reduce((s, e) => s + (e.quantity || 1), 0)
        const totalCount = unitsQty + nonUnitsQty
        const hasZero = bucket === '1' && [...units, ...nonUnits].some(e => (e.position.card.cost ?? 0) === 0)
        const isFilteredOut = cardMatchesFilters ? (c: CardData) => !cardMatchesFilters(c) : undefined
        return (
          <div key={bucket} className="arena-cost-column">
            <div className="arena-cost-header">
              {bucket === '1' && hasZero ? (
                <>
                  <CostIcon cost="0" size={28} />
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>—</span>
                  <CostIcon cost="1" size={28} />
                </>
              ) : (
                <CostIcon cost={bucket} size={28} />
              )}
              {totalCount > 0 && <span className="cost-count">({totalCount})</span>}
            </div>
            {unitsQty > 0 && (
              <>
                <div className="arena-stack-label">Unit ({unitsQty})</div>
                <ArenaCardStack
                  cards={units}
                  showPenalty={showAspectPenalties}
                  leaderCard={leaderCard}
                  baseCard={baseCard}
                  calculatePenalty={calculatePenalty}
                  onCardClick={handleCardClick}
                  onCardMouseEnter={onCardMouseEnter}
                  onCardMouseLeave={onCardMouseLeave}
                  onCardTouchStart={onCardTouchStart}
                  onCardTouchEnd={onCardTouchEnd}
                  hoveredCard={hoveredCard}
                  selectedCards={selectedCards}
                  density={density}
                  isFilteredOut={isFilteredOut}
                />
              </>
            )}
            {nonUnitsQty > 0 && (
              <div className={`arena-nonunits-stack ${unitsQty === 0 ? 'no-units-above' : ''}`}>
                <div className="arena-stack-label">Non-Unit ({nonUnitsQty})</div>
                <ArenaCardStack
                  cards={nonUnits}
                  showPenalty={showAspectPenalties}
                  leaderCard={leaderCard}
                  baseCard={baseCard}
                  calculatePenalty={calculatePenalty}
                  onCardClick={handleCardClick}
                  onCardMouseEnter={onCardMouseEnter}
                  onCardMouseLeave={onCardMouseLeave}
                  onCardTouchStart={onCardTouchStart}
                  onCardTouchEnd={onCardTouchEnd}
                  hoveredCard={hoveredCard}
                  selectedCards={selectedCards}
                  density={density}
                  isFilteredOut={isFilteredOut}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // Group cards by sorted aspect-combo key (used by aspect-columns rendering)
  const cardsByCombo = useMemo(() => {
    const map = new Map<string, ArenaCardAreaCardEntry[]>()
    cards.forEach(entry => {
      const key = comboKeyFor(entry.position.card.aspects as string[] | undefined)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    })
    return map
  }, [cards])

  // Group entries by name → quantity-aware GroupedCardEntry, sorted by cost/aspect/name
  const groupByNameSorted = useCallback((entries: ArenaCardAreaCardEntry[]): GroupedCardEntry[] => {
    const grouped = new Map<string, ArenaCardAreaCardEntry[]>()
    entries.forEach(e => {
      const name = e.position.card.name || e.cardId
      if (!grouped.has(name)) grouped.set(name, [])
      grouped.get(name)!.push(e)
    })
    const result: GroupedCardEntry[] = []
    grouped.forEach(es => {
      result.push({
        cardId: es[0].cardId,
        cardIds: es.map(e => e.cardId),
        position: es[0].position,
        quantity: es.length,
      })
    })
    result.sort((a, b) => {
      const A = a.position.card, B = b.position.card
      const cA = A.cost ?? 0, cB = B.cost ?? 0
      if (cA !== cB) return cA - cB
      const aA = getAspectSortValue(A), aB = getAspectSortValue(B)
      if (aA !== aB) return aA - aB
      return (A.name || '').localeCompare(B.name || '')
    })
    return result
  }, [])

  // Aspect mode — same visual structure as cost mode (.arena-cost-columns), but
  // each major column (Vigilance / Command / Aggression / Cunning / Neutral / Multi)
  // is internally split into two sub-columns: Units (left) and Non-Units (right).
  const renderAspectColumns = () => {
    const isFilteredOut = cardMatchesFilters ? (c: CardData) => !cardMatchesFilters(c) : undefined

    const isUnit = (e: ArenaCardAreaCardEntry) => e.position.card.type === 'Unit'

    const renderSubSection = (label: string, comboKey: string, unitFilter: 'unit' | 'nonUnit') => {
      const all = cardsByCombo.get(comboKey) || []
      const filtered = all.filter(e => unitFilter === 'unit' ? isUnit(e) : !isUnit(e))
      if (filtered.length === 0) return null
      const grouped = groupByNameSorted(filtered)
      const totalQty = grouped.reduce((s, e) => s + (e.quantity || 1), 0)
      return (
        <div key={`${comboKey}-${unitFilter}`}>
          <div className="arena-stack-label">{label} ({totalQty})</div>
          <ArenaCardStack
            cards={grouped}
            showPenalty={showAspectPenalties}
            leaderCard={leaderCard}
            baseCard={baseCard}
            calculatePenalty={calculatePenalty}
            onCardClick={handleCardClick}
            onCardMouseEnter={onCardMouseEnter}
            onCardMouseLeave={onCardMouseLeave}
            onCardTouchStart={onCardTouchStart}
            onCardTouchEnd={onCardTouchEnd}
            hoveredCard={hoveredCard}
            selectedCards={selectedCards}
            density={density}
            isFilteredOut={isFilteredOut}
          />
        </div>
      )
    }

    const renderUnitNonUnitSplit = (subs: Array<{ comboKey: string; label: string }>) => {
      const unitCount = subs.reduce((s, sub) => s + (cardsByCombo.get(sub.comboKey) || []).filter(isUnit).length, 0)
      const nonUnitCount = subs.reduce((s, sub) => s + (cardsByCombo.get(sub.comboKey) || []).filter(e => !isUnit(e)).length, 0)
      return (
        <div className="arena-aspect-column-split">
          <div className="arena-aspect-subcolumn">
            <div className="arena-stack-label arena-subcolumn-label">Unit{unitCount ? ` (${unitCount})` : ''}</div>
            {subs.map(s => renderSubSection(s.label, s.comboKey, 'unit'))}
          </div>
          <div className="arena-aspect-subcolumn">
            <div className="arena-stack-label arena-subcolumn-label">Non-Unit{nonUnitCount ? ` (${nonUnitCount})` : ''}</div>
            {subs.map(s => renderSubSection(s.label, s.comboKey, 'nonUnit'))}
          </div>
        </div>
      )
    }

    const ICON_PX = 22 // 20% smaller than the 28px used in cost-mode headers

    const renderPrimaryColumn = (primary: string) => {
      const subs: Array<{ comboKey: string; label: string }> = [
        { comboKey: [primary, 'Villainy'].sort().join('|'), label: `+ Villainy` },
        { comboKey: [primary, 'Heroism'].sort().join('|'), label: `+ Heroism` },
        { comboKey: `${primary}|${primary}`, label: 'Double' },
        { comboKey: primary, label: 'Mono' },
      ]
      const totalQty = subs.reduce((s, sub) => s + (cardsByCombo.get(sub.comboKey)?.length || 0), 0)
      return (
        <div key={primary} className="arena-cost-column arena-aspect-column">
          <div className="arena-cost-header">
            <img src={`/icons/${primary.toLowerCase()}.png`} alt={primary} style={{ width: ICON_PX, height: ICON_PX }} />
            {totalQty > 0 && <span className="cost-count" style={{ marginLeft: 4 }}>({totalQty})</span>}
          </div>
          {renderUnitNonUnitSplit(subs)}
        </div>
      )
    }

    const renderNeutralColumn = () => {
      const subs = [
        { comboKey: 'Villainy', label: 'Villainy' },
        { comboKey: 'Heroism', label: 'Heroism' },
        { comboKey: 'Neutral', label: 'Neutral' },
      ]
      const totalQty = subs.reduce((s, sub) => s + (cardsByCombo.get(sub.comboKey)?.length || 0), 0)
      if (totalQty === 0) return null
      return (
        <div key="neutral" className="arena-cost-column arena-aspect-column">
          <div className="arena-cost-header">
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Neutral</span>
            {totalQty > 0 && <span className="cost-count" style={{ marginLeft: 6 }}>({totalQty})</span>}
          </div>
          {renderUnitNonUnitSplit(subs)}
        </div>
      )
    }

    const renderMultiColumn = () => {
      const multiKeys = [...cardsByCombo.keys()]
        .filter(isMultiPrimaryComboKey)
        .sort((a, b) => a.localeCompare(b))
      if (multiKeys.length === 0) return null
      const totalQty = multiKeys.reduce((s, k) => s + (cardsByCombo.get(k)?.length || 0), 0)
      const multiHeaderAspects = [...PRIMARY_ASPECTS, 'Villainy', 'Heroism']
      const subs = multiKeys.map(k => ({ comboKey: k, label: k.replace(/\|/g, ' + ') }))
      return (
        <div key="multi" className="arena-cost-column arena-aspect-column">
          <div className="arena-cost-header">
            <span className="arena-multi-aspect-icons">
              {multiHeaderAspects.map(a => (
                <img
                  key={a}
                  src={`/icons/${a.toLowerCase()}.png`}
                  alt={a}
                  style={{ width: ICON_PX, height: ICON_PX }}
                />
              ))}
            </span>
            {totalQty > 0 && <span className="cost-count" style={{ marginLeft: 6 }}>({totalQty})</span>}
          </div>
          {renderUnitNonUnitSplit(subs)}
        </div>
      )
    }

    return (
      <div className="arena-cost-columns arena-aspect-columns">
        {PRIMARY_ASPECTS.map(p => renderPrimaryColumn(p))}
        {renderNeutralColumn()}
        {renderMultiColumn()}
      </div>
    )
  }

  // Type/default fallback grouped blocks (no per-aspect column treatment)
  const renderGroupedBlocks = () => {
    if (!groupedBlocks) return null
    const { groups, sortedKeys } = groupedBlocks
    const blockTypeClass = sortOption === 'type' ? 'type-block' : 'aspect-block'
    return (
      <div className="blocks-pool-row">
        {sortedKeys.map(groupKey => {
          const groupCards = groups[groupKey]
          return (
            <div key={groupKey} className={`card-block pool-group-block ${blockTypeClass}`}>
              <div className="card-block-header">
                <GroupHeader
                  groupKey={groupKey}
                  count={groupCards.length}
                  sortOption={sortOption}
                  getAspectSymbol={getAspectSymbol}
                />
              </div>
              <div className="card-block-content">
                <div className={`arena-pool-grid arena-pool-grid--${density}`}>
                  {groupCards.map(renderFlatCard)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderFlatGrid = () => (
    <div className={`arena-pool-grid arena-pool-grid--${density}`}>
      {sortedFlatCards.map(renderFlatCard)}
    </div>
  )

  if (cards.length === 0) {
    return <div className="arena-empty-pool">{emptyMessage}</div>
  }
  if (sortOption === 'cost') return renderCostColumns()
  if (sortOption === 'aspect') return renderAspectColumns()
  if (sortOption === 'type') return renderGroupedBlocks()
  return renderFlatGrid()
}

export default ArenaCardArea
