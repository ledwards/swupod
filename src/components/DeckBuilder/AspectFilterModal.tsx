// @ts-nocheck
/**
 * AspectFilterModal Component
 *
 * Visibility filter — checkboxes mark which aspect combos are SHOWN.
 * Filtered-out cards stay in their section but render greyed out.
 * Does NOT move cards.
 *
 * Filter keys are exact aspect-combo keys: 'Vigilance' (mono), 'Vigilance|Villainy', etc.
 * 'Neutral' for no-aspect cards.
 */

import { useMemo, type MouseEvent } from 'react'
import Button from '../Button'
import AspectIcon from '../AspectIcon'
import { calculateAspectPenalty } from '../../services/cards/aspectPenalties'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'
import type { CardPosition } from './AspectPenaltyToggle'
import type { BulkMoveMode } from './BulkMoveButtons'

type AspectSize = 'small' | 'medium' | 'large'
type IconSize = 'sm' | 'md' | 'lg'

const NEUTRAL_KEY = 'Neutral'

// Combo key from a card's aspects: sorted, joined with '|'. No aspects → 'Neutral'.
const comboKeyFor = (aspects: string[] | undefined): string => {
  if (!aspects || aspects.length === 0) return NEUTRAL_KEY
  return [...aspects].sort().join('|')
}

const getAspectSymbol = (aspect: string, size: AspectSize = 'medium') => {
  const sizeMap: Record<AspectSize, IconSize> = { 'small': 'sm', 'medium': 'md', 'large': 'lg' }
  return <AspectIcon aspect={aspect} size={sizeMap[size] || 'md'} />
}

export interface AspectFilterModalProps {
  isOpen: boolean
  onClose?: () => void
  mode?: BulkMoveMode
  cardPositions?: Record<string, CardPosition>
  activeLeader?: string | null
  activeBase?: string | null
  filterAspectsExpanded?: Record<string, boolean>
  onFilterAspectsExpandedChange?: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  cardCount?: number
}

export function AspectFilterModal({
  isOpen,
  onClose,
  mode = 'deck',
  cardPositions: cardPositionsProp,
  activeLeader: activeLeaderProp,
  activeBase: activeBaseProp,
  filterAspectsExpanded: filterAspectsExpandedProp,
  onFilterAspectsExpandedChange: onFilterAspectsExpandedChangeProp,
  cardCount: cardCountProp,
}: AspectFilterModalProps) {
  let contextValue: ReturnType<typeof useDeckBuilder> | null = null
  try {
    contextValue = useDeckBuilder()
  } catch {
    // Not inside a provider
  }

  const cardPositions = cardPositionsProp ?? contextValue?.cardPositions ?? {}
  const activeLeader = activeLeaderProp ?? contextValue?.activeLeader
  const activeBase = activeBaseProp ?? contextValue?.activeBase
  const filterAspectsExpanded = filterAspectsExpandedProp ?? contextValue?.filterAspectsExpanded ?? {}
  const onFilterAspectsExpandedChange = onFilterAspectsExpandedChangeProp ?? contextValue?.setFilterAspectsExpanded

  const aspectFilters = contextValue?.aspectFilters ?? {}
  const setAspectFilters = contextValue?.setAspectFilters
  const inAspectFilter = contextValue?.inAspectFilter ?? true
  const setInAspectFilter = contextValue?.setInAspectFilter
  const outAspectFilter = contextValue?.outAspectFilter ?? true
  const setOutAspectFilter = contextValue?.setOutAspectFilter
  const filteredCardDisplay = contextValue?.filteredCardDisplay ?? 'fade'
  const setFilteredCardDisplay = contextValue?.setFilteredCardDisplay

  const isDeckMode = mode === 'deck'

  // Cards in this section (always recompute; cheap)
  const sectionCards = useMemo(() => {
    return Object.values(cardPositions).filter(pos => {
      if (!pos.visible || pos.card?.isBase || pos.card?.isLeader) return false
      const inDeck = pos.section === 'deck' && pos.enabled !== false
      const inPool = pos.section === 'sideboard' || pos.enabled === false
      return isDeckMode ? inDeck : inPool
    })
  }, [cardPositions, isDeckMode])

  // Counts per combo key in this section
  const countByCombo = useMemo(() => {
    const counts: Record<string, number> = {}
    sectionCards.forEach(pos => {
      const k = comboKeyFor(pos.card.aspects as string[] | undefined)
      counts[k] = (counts[k] || 0) + 1
    })
    return counts
  }, [sectionCards])

  if (!isOpen) return null

  const cardCount = cardCountProp ?? sectionCards.length
  const title = `Show in ${isDeckMode ? 'Deck' : 'Pool'} (${cardCount})`

  const leaderCard = activeLeader && cardPositions[activeLeader]?.card
  const baseCard = activeBase && cardPositions[activeBase]?.card

  // Default visibility: undefined → true. Only false hides.
  const isComboVisible = (key: string): boolean => aspectFilters[key] !== false

  const setComboVisible = (key: string, visible: boolean) => {
    setAspectFilters?.(prev => ({ ...prev, [key]: visible }))
  }

  const setMultipleComboVisible = (keys: string[], visible: boolean) => {
    setAspectFilters?.(prev => {
      const next = { ...prev }
      keys.forEach(k => { next[k] = visible })
      return next
    })
  }

  // ---- Render In/Out Aspect filters ----
  const renderInOutAspectFilters = () => {
    if (!activeLeader || !activeBase || !leaderCard || !baseCard) return null

    const myAspects = [...(leaderCard.aspects as string[] || []), ...(baseCard.aspects as string[] || [])]
    const allAspects = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Villainy', 'Heroism']
    const outAspects = allAspects.filter(a => !myAspects.includes(a))

    const inAspectCount = sectionCards.filter(pos => calculateAspectPenalty(pos.card, leaderCard, baseCard) === 0).length
    const outAspectCount = sectionCards.filter(pos => calculateAspectPenalty(pos.card, leaderCard, baseCard) > 0).length

    return (
      <div style={{ marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem', cursor: 'pointer', color: 'white', fontSize: '0.8rem' }}>
          <input
            type="checkbox"
            checked={inAspectFilter}
            onChange={(e) => setInAspectFilter?.(e.target.checked)}
            style={{ width: '14px', height: '14px' }}
          />
          <span style={{ textTransform: 'uppercase' }}>In Aspect</span>
          <span style={{ display: 'flex', gap: '2px' }}>{myAspects.map((a, i) => <span key={i}>{getAspectSymbol(a, 'small')}</span>)}</span>
          <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.75rem' }}>{inAspectCount}</span>
        </label>
        {outAspects.length > 0 && outAspectCount > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem', cursor: 'pointer', color: 'white', fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              checked={outAspectFilter}
              onChange={(e) => setOutAspectFilter?.(e.target.checked)}
              style={{ width: '14px', height: '14px' }}
            />
            <span style={{ textTransform: 'uppercase' }}>Out of Aspect</span>
            <span style={{ display: 'flex', gap: '2px' }}>{outAspects.map((a, i) => <span key={i}>{getAspectSymbol(a, 'small')}</span>)}</span>
            <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.75rem' }}>{outAspectCount}</span>
          </label>
        )}
      </div>
    )
  }

  // ---- Render hierarchical aspect filters for color aspects ----
  const renderColorAspectFilters = () => {
    return ['Vigilance', 'Command', 'Aggression', 'Cunning'].map(aspect => {
      // Standard sub-groups (sorted aspects in keys)
      const subGroups = [
        { key: [aspect, 'Villainy'].sort().join('|'), label: `${aspect} + Villainy`, aspects: [aspect, 'Villainy'] },
        { key: [aspect, 'Heroism'].sort().join('|'), label: `${aspect} + Heroism`, aspects: [aspect, 'Heroism'] },
        { key: [aspect, aspect].sort().join('|'), label: `Double ${aspect}`, aspects: [aspect, aspect] },
        { key: aspect, label: `${aspect} (mono)`, aspects: [aspect] },
      ]

      // Find any other combos in section that include this primary aspect
      const otherCombos = Object.keys(countByCombo)
        .filter(k => k.split('|').includes(aspect) && !subGroups.some(sg => sg.key === k))
        .map(k => ({ key: k, label: k.replace(/\|/g, ' + '), aspects: k.split('|') }))

      const allSubGroups = [...subGroups, ...otherCombos]
        .map(sg => ({ ...sg, count: countByCombo[sg.key] || 0 }))
        .filter(sg => sg.count > 0)

      const parentTotal = allSubGroups.reduce((s, sg) => s + sg.count, 0)
      if (parentTotal === 0) return null

      const visibleSubGroups = allSubGroups.filter(sg => isComboVisible(sg.key))
      const allVisible = visibleSubGroups.length === allSubGroups.length
      const noneVisible = visibleSubGroups.length === 0
      const isExpanded = filterAspectsExpanded[aspect] || false

      const handleParentToggle = (e) => {
        const next = !allVisible // if all visible, hide all; otherwise show all
        setMultipleComboVisible(allSubGroups.map(sg => sg.key), next)
      }

      const handleExpandToggle = (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onFilterAspectsExpandedChange?.(prev => ({ ...prev, [aspect]: !isExpanded }))
      }

      return (
        <div key={aspect} style={{ marginBottom: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem', color: 'white', fontSize: '0.85rem', userSelect: 'none' }}>
            <button
              type="button"
              onClick={handleExpandToggle}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
              style={{ width: '14px', height: '14px', padding: 0, background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.7rem' }}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', flex: 1 }}>
              <input
                type="checkbox"
                checked={allVisible}
                ref={el => { if (el) el.indeterminate = !allVisible && !noneVisible }}
                onChange={handleParentToggle}
                style={{ width: '14px', height: '14px' }}
              />
              {getAspectSymbol(aspect, 'small')}
              <span style={{ textTransform: 'uppercase' }}>{aspect}</span>
              <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.75rem' }}>{parentTotal}</span>
            </label>
          </div>
          {isExpanded && allSubGroups.map(sg => {
            const sgVisible = isComboVisible(sg.key)
            return (
              <label
                key={sg.key}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.15rem 0.2rem 0.15rem 1.75rem', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}
              >
                <input
                  type="checkbox"
                  checked={sgVisible}
                  onChange={(e) => setComboVisible(sg.key, e.target.checked)}
                  style={{ width: '12px', height: '12px' }}
                />
                <span style={{ display: 'flex', gap: '1px' }}>{sg.aspects.map((a, i) => <span key={i}>{getAspectSymbol(a, 'small')}</span>)}</span>
                <span style={{ textTransform: 'uppercase' }}>{sg.label}</span>
                <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.7rem' }}>{sg.count}</span>
              </label>
            )
          })}
        </div>
      )
    })
  }

  // ---- Render flat aspect filters for Villainy, Heroism, Neutral ----
  const renderFlatAspectFilters = () => {
    return ['Villainy', 'Heroism', 'Neutral'].map(aspect => {
      const filterKey = aspect === 'Neutral' ? NEUTRAL_KEY : aspect
      const count = countByCombo[filterKey] || 0
      if (count === 0 && aspect !== 'Neutral') return null

      const isVisible = isComboVisible(filterKey)

      return (
        <div key={aspect} style={{ marginBottom: '0.25rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem', color: 'white', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ fontSize: '0.7rem', width: '14px' }}></span>
            <input
              type="checkbox"
              checked={isVisible}
              onChange={(e) => setComboVisible(filterKey, e.target.checked)}
              style={{ width: '14px', height: '14px' }}
            />
            {aspect !== 'Neutral' && getAspectSymbol(aspect, 'small')}
            <span style={{ textTransform: 'uppercase' }}>{aspect}</span>
            <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.75rem' }}>{count}</span>
          </label>
        </div>
      )
    })
  }

  return (
    <>
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1999, background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />
      <div
        className="filter-modal"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 2000,
          background: 'rgba(20,20,20,0.98)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '12px',
          padding: '1rem',
          minWidth: '280px',
          maxWidth: '90vw',
          backdropFilter: 'blur(10px)',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          textTransform: 'none'
        }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '0.5rem' }}>
          <span style={{ color: 'white', fontSize: '1rem', fontWeight: 'bold' }}>{title}</span>
          <Button variant="icon" size="sm" onClick={onClose}>×</Button>
        </div>
        {renderInOutAspectFilters()}
        {renderColorAspectFilters()}
        {renderFlatAspectFilters()}
        <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.75rem' }}>Filtered cards:</span>
          <button
            style={{ padding: '2px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.3)', background: filteredCardDisplay !== 'hide' ? 'rgba(255,255,255,0.15)' : 'transparent', color: 'white', cursor: 'pointer' }}
            onClick={() => setFilteredCardDisplay?.('fade')}
          >Fade</button>
          <button
            style={{ padding: '2px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.3)', background: filteredCardDisplay === 'hide' ? 'rgba(255,255,255,0.15)' : 'transparent', color: 'white', cursor: 'pointer' }}
            onClick={() => setFilteredCardDisplay?.('hide')}
          >Hide</button>
        </div>
      </div>
    </>
  )
}

export default AspectFilterModal
