// @ts-nocheck
/**
 * PackSelector Component
 *
 * Shared pack selection UI for other format modes:
 * - Chaos Draft (multi-select, up to 3)
 * - Chaos Sealed (multi-select, up to 6)
 * - Pack Wars (single select)
 * - Pack Blitz (single select)
 *
 * Displays packs in a grid that fits 6 per row on desktop, 3 on mobile.
 */

import { useState } from 'react'
import { getPackImageUrl } from '@/src/utils/packArt'
import { getSetConfig } from '@/src/utils/setConfigs'
import { isSetBeta, isSetPrerelease } from '@/src/utils/api'
import { getBaseCode, sortSetsForDisplay } from '@/src/utils/packSelectorSort'
import { MAX_PROMO_PACKS_TOTAL } from '@/src/services/chaosSealedSelection'
import type { SetData } from '@/src/utils/packSelectorSort'
import SubscribeModal from './SubscribeModal'
import { buildTeaserModalCopy } from './setSelectionTeaser'
import './PackSelector.css'

// Get set color from config
function getSetColor(setCode: string): string {
  const config = getSetConfig(getBaseCode(setCode))
  return config?.color || '#ffffff'
}

export interface PackSelectorProps {
  sets: SetData[]
  /** For single select mode */
  selectedSet?: string | null
  onSelectSet?: (setCode: string) => void
  /** For multi-select mode */
  selectedSets?: string[]
  onSelectSets?: (setCodes: string[]) => void
  maxSelections?: number
  /** Whether to show +/- buttons for multi-select */
  showQuantityControls?: boolean
  title?: string
  /**
   * When the parent passes a sets list that includes a comingSoon entry
   * (via fetchSets({ peekUnreleased: true })), set this to control which
   * SubscribeModal CTA fires on teaser click:
   *   undefined or 'patreon' -> Patreon URL CTA (anon/non-sub)
   *   'beta' -> /beta CTA (patron-without-beta state)
   * The set comingSoon flag is honored regardless; this only controls CTA copy.
   */
  peekUnreleased?: 'patreon' | 'beta' | false
}

export function PackSelector({
  sets,
  selectedSet,
  onSelectSet,
  selectedSets = [],
  onSelectSets,
  maxSelections = 1,
  showQuantityControls = false,
  title = 'Select a Set',
  peekUnreleased = false,
}: PackSelectorProps) {
  const isMultiSelect = maxSelections > 1
  const [teaserModalOpen, setTeaserModalOpen] = useState(false)
  const [teaserModalSet, setTeaserModalSet] = useState<SetData | null>(null)
  const isPatronNoBeta = peekUnreleased === 'beta'

  // Count how many times each set is selected (for multi-select)
  const getSetCount = (setCode: string) => {
    return selectedSets.filter(s => s === setCode).length
  }

  // Event Packs augment the pool instead of filling a slot: they don't consume the pool's
  // slots, and they're capped by a shared total across both tiers rather than by the pool's
  // pack count.
  const promoCodes = new Set(sets.filter(s => s.promo).map(s => s.code))
  const isPromoCode = (setCode: string) => promoCodes.has(setCode)
  const slotsUsed = selectedSets.filter(code => !isPromoCode(code)).length
  const promosUsed = selectedSets.length - slotsUsed

  const canAddOne = (setCode: string) =>
    isPromoCode(setCode)
      ? promosUsed < MAX_PROMO_PACKS_TOTAL
      : slotsUsed < maxSelections

  const handleSetClick = (setCode: string) => {
    if (isMultiSelect && onSelectSets) {
      const count = getSetCount(setCode)
      if (count === 0) {
        // First click: add the set. Once selected, quantity is controlled only by the
        // +/- badges — clicking the card again is a no-op (so it never clears to 0 by
        // accident).
        if (canAddOne(setCode)) {
          onSelectSets([...selectedSets, setCode])
        }
      }
    } else if (onSelectSet) {
      onSelectSet(setCode)
    }
  }

  const handleAddOne = (setCode: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (onSelectSets && canAddOne(setCode)) {
      onSelectSets([...selectedSets, setCode])
    }
  }

  const handleRemoveOne = (setCode: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (onSelectSets) {
      const index = selectedSets.indexOf(setCode)
      if (index > -1) {
        onSelectSets([...selectedSets.slice(0, index), ...selectedSets.slice(index + 1)])
      }
    }
  }

  const sortedSets = sortSetsForDisplay(sets)

  const handleTeaserClick = (set: SetData) => {
    setTeaserModalSet(set)
    setTeaserModalOpen(true)
  }

  const renderSetButton = (set: SetData) => {
    // Locked variant: the pack is shown so you know it exists, but it can't be added yet.
    // The badge says what's needed and the tile links to the page that explains how.
    if (set.locked) {
      return (
        <a
          key={set.code}
          href={set.locked.href}
          className="pack-selector-button pack-selector-button--coming-soon"
          aria-label={`${set.name} — ${set.locked.description || set.locked.label}`}
          style={{ '--set-color': getSetColor(set.code) } as React.CSSProperties}
        >
          <div className="pack-selector-image">
            <img src={getPackImageUrl(set.code)} alt={set.name} />
          </div>
          <div className="pack-selector-content">
            <span className="pack-selector-name">{set.name}</span>
          </div>
          <span className="pack-selector-coming-soon-badge">
            <LockIconSm />
            <span>{set.locked.label}</span>
          </span>
        </a>
      )
    }

    // "Coming Soon" teaser variant for unreleased sets injected by peekUnreleased.
    if (set.comingSoon) {
      const setColor = getSetColor(set.code)
      const packImageUrl = getPackImageUrl(set.code)
      return (
        <div
          key={set.code}
          role="button"
          tabIndex={0}
          className="pack-selector-button pack-selector-button--coming-soon"
          onClick={() => handleTeaserClick(set)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTeaserClick(set) }}
          aria-label={`${set.name} — Coming Soon. Subscribe for early access.`}
          style={{
            '--set-color': setColor,
          } as React.CSSProperties}
        >
          <div className="pack-selector-image">
            <img src={packImageUrl} alt={set.name} />
          </div>
          <div className="pack-selector-content">
            <span className="pack-selector-name">{set.name}</span>
          </div>
          <span className="pack-selector-coming-soon-badge">
            <LockIconSm />
            <span>Coming Soon</span>
          </span>
        </div>
      )
    }

    const isSelected = isMultiSelect ? getSetCount(set.code) > 0 : selectedSet === set.code
    const count = getSetCount(set.code)
    const setColor = getSetColor(set.code)
    const packImageUrl = getPackImageUrl(set.code)

    // In single-select mode, mark unselected packs when one is selected
    const isUnselected = !isMultiSelect && selectedSet !== null && selectedSet !== set.code
    // In multi-select mode, mark unselected packs when max is reached
    const isMaxed = isMultiSelect && !isSelected && !canAddOne(set.code)

    return (
      <div
        key={set.code}
        role="button"
        tabIndex={0}
        className={`pack-selector-button ${isSelected ? 'selected' : ''} ${isUnselected ? 'unselected' : ''} ${isMaxed ? 'maxed' : ''}`}
        onClick={() => handleSetClick(set.code)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSetClick(set.code) }}
        style={{
          '--set-color': setColor,
        } as React.CSSProperties}
      >
        <div className="pack-selector-image">
          <img src={packImageUrl} alt={set.name} />
          {showQuantityControls && (isSelected || !isMaxed) && (
            <div className={`pack-selector-badge ${isSelected ? '' : 'pack-selector-badge--add-only'}`}>
              {isSelected && (
                <>
                  <button
                    className={`pack-selector-qty-btn ${count < 1 ? 'hidden' : ''}`}
                    onClick={(e) => handleRemoveOne(set.code, e)}
                    aria-label={`Remove one ${set.name} pack`}
                  >
                    −
                  </button>
                  <span className="pack-selector-count">{count}</span>
                </>
              )}
              <button
                className={`pack-selector-qty-btn ${canAddOne(set.code) ? '' : 'hidden'}`}
                onClick={(e) => handleAddOne(set.code, e)}
                aria-label={`Add one ${set.name} pack`}
              >
                +
              </button>
            </div>
          )}
        </div>
        <div className="pack-selector-content">
          <span className="pack-selector-name">{set.name}</span>
        </div>
        {isSetBeta(set) && <span className="pack-selector-beta">Beta</span>}
        {isSetPrerelease(set) && <span className="pack-selector-beta">Pre-Release</span>}
      </div>
    )
  }

  return (
    <div className="pack-selector-section">
      <h3>{title}</h3>
      <div className="pack-selector-grid">
        {sortedSets.main.map(renderSetButton)}
      </div>
      {sortedSets.carbonite.length > 0 && (
        <div className="pack-selector-grid carbonite-row">
          {sortedSets.carbonite.map(renderSetButton)}
        </div>
      )}
      {sortedSets.promos.length > 0 && (
        <div className="pack-selector-promos">
          <h4 className="pack-selector-subhead">GC 2026 Event Packs</h4>
          <div className="pack-selector-grid pack-selector-grid--promos">
            {sortedSets.promos.map(renderSetButton)}
          </div>
        </div>
      )}
      <SubscribeModal
        isOpen={teaserModalOpen}
        onClose={() => setTeaserModalOpen(false)}
        {...buildTeaserModalCopy(
          isPatronNoBeta ? 'patronNoBeta' : 'nonSub',
          teaserModalSet?.name ?? '',
        )}
        setCode={teaserModalSet?.code}
        surface="setPreview"
      />
    </div>
  )
}

// Small inline lock icon — local so PackSelector stays self-contained.
function LockIconSm() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export default PackSelector
