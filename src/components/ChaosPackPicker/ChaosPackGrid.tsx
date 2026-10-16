'use client'
import { useState } from 'react'
import Button from '../Button'
import SubscribeModal from '../SubscribeModal'
import { buildTeaserModalCopy } from '../setSelectionTeaser'
import { getPackImageUrl } from '../../utils/packArt'
import { isSetBeta, isSetPrerelease } from '../../utils/api'
import { sortSetsForDisplay, type SetData } from '../../utils/packSelectorSort'
import { canAddPack, type PackLimits, type PickerState } from '../../services/chaosPackPicker'
import type { PeekVariant } from './useChaosPackSets'
import './chaos-pack-picker.css'

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

/**
 * The set side of the pack picker: one tile per pack. Tapping a tile adds one pack of it to
 * the summary; nothing here removes or counts slots (the summary owns both). Event Packs are
 * tiles in the same grid; a locked one links to how to unlock it.
 */
export default function ChaosPackGrid({ sets, state, limits, onAdd, peekVariant, disabled = false }: {
  sets: SetData[]
  state: PickerState
  limits?: PackLimits
  onAdd: (code: string) => void
  peekVariant: PeekVariant
  disabled?: boolean
}) {
  const [teaser, setTeaser] = useState<SetData | null>(null)
  const { main, carbonite, promos } = sortSetsForDisplay(sets)
  const chosen = (code: string) => state.picks.filter((p) => p === code).length

  const tile = (set: SetData) => {
    const art = <img src={getPackImageUrl(set.code)} alt="" />
    if (set.locked) {
      return (
        <a key={set.code} className="cpk-tile cpk-tile--locked" href={set.locked.href}
          aria-label={`${set.name}: ${set.locked.description || set.locked.label}`}>
          {art}
          <span className="cpk-tile-name">{set.name}</span>
          <span className="cpk-tile-badge"><LockIcon />{set.locked.label}</span>
        </a>
      )
    }
    if (set.comingSoon) {
      return (
        <Button key={set.code} className="cpk-tile cpk-tile--locked" onClick={() => setTeaser(set)}
          aria-label={`${set.name}: coming soon`}>
          {art}
          <span className="cpk-tile-name">{set.name}</span>
          <span className="cpk-tile-badge"><LockIcon />Coming Soon</span>
        </Button>
      )
    }
    const n = chosen(set.code)
    return (
      <Button key={set.code} className="cpk-tile" data-picked={n > 0 || undefined}
        disabled={disabled || !canAddPack(state, set.code, limits)} onClick={() => onAdd(set.code)}
        aria-label={`Add a ${set.name} pack${n ? `, ${n} chosen` : ''}`}>
        {art}
        <span className="cpk-tile-name">{set.name}</span>
        {n > 0 && <span className="cpk-tile-count" aria-hidden="true">×{n}</span>}
        {(isSetBeta(set) || isSetPrerelease(set)) && (
          <span className="cpk-tile-badge">{isSetBeta(set) ? 'Beta' : 'Pre-Release'}</span>
        )}
      </Button>
    )
  }

  return (
    <div className="cpk-grid-groups">
      <div className="cpk-grid" role="group" aria-label="Sets">{main.map(tile)}</div>
      {carbonite.length > 0 && (
        <>
          <h3 className="cpk-group-title">Carbonite Edition</h3>
          <div className="cpk-grid" role="group" aria-label="Carbonite Edition">{carbonite.map(tile)}</div>
        </>
      )}
      {promos.length > 0 && (
        <>
          <h3 className="cpk-group-title">GC 2026 Event Packs</h3>
          <div className="cpk-grid" role="group" aria-label="GC 2026 Event Packs">{promos.map(tile)}</div>
        </>
      )}
      <SubscribeModal
        isOpen={teaser !== null}
        onClose={() => setTeaser(null)}
        {...buildTeaserModalCopy(peekVariant === 'beta' ? 'patronNoBeta' : 'nonSub', teaser?.name ?? '')}
        {...(teaser ? { setCode: teaser.code } : {})}
        surface="setPreview"
      />
    </div>
  )
}
