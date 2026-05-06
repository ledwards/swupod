// @ts-nocheck
'use client'

import { useMemo, useState } from 'react'
import Button from '../Button'
import { AspectIcon } from '../AspectIcon'
import CardPickerModal from './CardPickerModal'
import SourceImageModal from './SourceImageModal'
import {
  getAspectCombinationKey,
  getAspectCombinationDisplayName,
} from '../../utils/aspectCombinations'
import type { useImportPool, ResolvedRow, MatchedCard } from '../../hooks/useImportPool'

interface Props {
  importPool: ReturnType<typeof useImportPool>
}

const ASPECT_NAMES = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Heroism', 'Villainy'] as const

/**
 * ResolveStep — Step 2 of the Import Pool wizard.
 *
 * Sections rendered in order:
 *   1. Leaders (all sheet leaders, even unselected ones)
 *   2. Bases (all sheet bases)
 *   3. Aspect groups for everything else, ordered by aspect priority
 *
 * Default view: "show only my pool" — rows with poolQty=0 are hidden.
 * Eye toggle in the totals strip flips to "show all rows".
 *
 * Needs-attention rows (fuzzy / ambiguous / unmatched) get a small image
 * icon that opens the source-sheet image so the user can verify against
 * the original.
 */
export default function ResolveStep({ importPool }: Props) {
  const {
    state,
    validation,
    setRowQty,
    replaceRowCard,
    setActiveLeader,
    setActiveBase,
    goBack,
    goToConfirm,
    toggleShowOnlyPool,
  } = importPool

  const [pickerFor, setPickerFor] = useState<{
    rowKey: string
    candidates: MatchedCard[]
    typeFilter?: string
  } | null>(null)

  const [sourceModalOpen, setSourceModalOpen] = useState(false)

  const setCode = state.extraction?.header.setCode || ''

  const grouped = useMemo(
    () => groupRows(state.resolvedRows, state.showOnlyPool),
    [state.resolvedRows, state.showOnlyPool],
  )

  const totalShown = grouped.reduce((sum, g) => sum + g.rows.length, 0)
  const hiddenZero = state.resolvedRows.length - totalShown

  return (
    <section className="import-pool-step import-pool-step--resolve">
      <header className="import-pool-resolve-header">
        <h2>Resolve extraction</h2>
        <p className="import-pool-help">
          Review the cards extracted from your sheet. Click a leader or base
          row's <span className="ip-star-glyph">☆</span> to set it as active. Pool must
          total 96 cards (1 leader + 1 base + 14 other × 6).
        </p>
        {state.warnings.length > 0 && (
          <div className="import-pool-warnings" role="alert">
            <strong>Heads up — some rows needed cleanup during extraction:</strong>
            <ul>
              {state.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <small>Fix anything that doesn't look right below before continuing.</small>
          </div>
        )}
        <div className="import-pool-totals-row">
          <RunningTotals validation={validation} />
          <div className="ip-totals-toolbar">
            {state.images.length > 0 && (
              <button
                type="button"
                className="ip-icon-btn"
                onClick={() => setSourceModalOpen(true)}
                title="View source sheet"
              >
                <span aria-hidden="true">🔍</span>
                <span className="ip-icon-btn__label">Source</span>
              </button>
            )}
            <button
              type="button"
              className={`ip-icon-btn ${state.showOnlyPool ? 'ip-icon-btn--active' : ''}`}
              onClick={toggleShowOnlyPool}
              title={state.showOnlyPool ? 'Showing only your pool — click to show all sheet rows' : 'Showing all sheet rows — click to show only your pool'}
            >
              <span aria-hidden="true">{state.showOnlyPool ? '👁' : '👁‍🗨'}</span>
              <span className="ip-icon-btn__label">
                {state.showOnlyPool ? `Pool only (${hiddenZero} hidden)` : 'All rows'}
              </span>
            </button>
          </div>
        </div>
      </header>

      <table className="ip-table">
        <colgroup>
          <col className="ip-col-played" />
          <col className="ip-col-total" />
          <col className="ip-col-no" />
          <col className="ip-col-name" />
        </colgroup>
        <thead>
          <tr>
            <th>PLAYED</th>
            <th>TOTAL</th>
            <th>NO</th>
            <th>NAME</th>
          </tr>
        </thead>
        {grouped.map((group) => (
          <tbody key={group.key} className="ip-section">
            <tr className="ip-section-row">
              <td colSpan={4}>
                <div className="ip-section-bar">
                  <span className="ip-section__title">
                    {group.aspects.length > 0 && (
                      <span className="ip-section__icons">
                        {group.aspects.map((a) => (
                          <AspectIcon key={a} aspect={a} size="sm" />
                        ))}
                      </span>
                    )}
                    {group.displayName}
                  </span>
                  <span className="ip-section__count">
                    {group.rows.reduce((s, r) => s + r.poolQty, 0)} cards
                  </span>
                </div>
              </td>
            </tr>
            {group.rows.map((row) => (
              <RowItem
                key={row.key}
                row={row}
                isActiveLeader={!!row.card && state.activeLeaderId === row.card.id}
                isActiveBase={!!row.card && state.activeBaseId === row.card.id}
                hasSourceImage={state.images.length > 0}
                onIncPool={() => setRowQty(row.key, 'poolQty', row.poolQty + 1)}
                onDecPool={() => setRowQty(row.key, 'poolQty', row.poolQty - 1)}
                onIncDeck={() => setRowQty(row.key, 'deckQty', row.deckQty + 1)}
                onDecDeck={() => setRowQty(row.key, 'deckQty', row.deckQty - 1)}
                onToggleLeader={() => row.card && setActiveLeader(row.card.id)}
                onToggleBase={() => row.card && setActiveBase(row.card.id)}
                onPickCard={() =>
                  setPickerFor({
                    rowKey: row.key,
                    candidates: row.candidates,
                    typeFilter: row.extracted.type,
                  })
                }
                onViewSource={() => setSourceModalOpen(true)}
              />
            ))}
          </tbody>
        ))}
      </table>

      <div className="import-pool-actions">
        <Button variant="back" onClick={goBack}>
          ← Re-upload
        </Button>
        <div className="import-pool-actions-spacer" />
        <Button variant="primary" onClick={goToConfirm} disabled={!validation.valid}>
          Continue →
        </Button>
      </div>

      {!validation.valid && (
        <ul className="import-pool-validation-errors">
          {validation.errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}

      {pickerFor && (
        <CardPickerModal
          setCode={setCode}
          candidates={pickerFor.candidates}
          typeFilter={pickerFor.typeFilter}
          onPick={(card) => replaceRowCard(pickerFor.rowKey, card)}
          onClose={() => setPickerFor(null)}
        />
      )}

      {sourceModalOpen && state.images.length > 0 && (
        <SourceImageModal
          images={state.images}
          onClose={() => setSourceModalOpen(false)}
        />
      )}
    </section>
  )
}

// === Sub-components ===

function RunningTotals({ validation }: { validation: any }) {
  return (
    <div className="import-pool-totals">
      <span className={validation.poolCount === 96 ? 'totals-ok' : 'totals-bad'}>
        Pool: {validation.poolCount} / 96
      </span>
      <span>Deck: {validation.deckCount}</span>
      <span className={validation.hasLeader ? 'totals-ok' : 'totals-bad'}>
        Leader: {validation.hasLeader ? '✓' : '✗'}
      </span>
      <span className={validation.hasBase ? 'totals-ok' : 'totals-bad'}>
        Base: {validation.hasBase ? '✓' : '✗'}
      </span>
      {validation.unresolvedCount > 0 && (
        <span className="totals-bad">{validation.unresolvedCount} unresolved</span>
      )}
    </div>
  )
}

interface RowItemProps {
  row: ResolvedRow
  isActiveLeader: boolean
  isActiveBase: boolean
  hasSourceImage: boolean
  onIncPool: () => void
  onDecPool: () => void
  onIncDeck: () => void
  onDecDeck: () => void
  onToggleLeader: () => void
  onToggleBase: () => void
  onPickCard: () => void
  onViewSource: () => void
}

function RowItem({
  row,
  isActiveLeader,
  isActiveBase,
  hasSourceImage,
  onIncPool,
  onDecPool,
  onIncDeck,
  onDecDeck,
  onToggleLeader,
  onToggleBase,
  onPickCard,
  onViewSource,
}: RowItemProps) {
  const isLeader = !!row.card?.isLeader
  const isBase = !!row.card?.isBase
  const isActive = isActiveLeader || isActiveBase
  const isUnresolved = !row.card
  const needsAttention = isUnresolved || row.confidence === 'fuzzy' || row.confidence === 'ambiguous'
  const cardNumber = extractCardNumber(row.card?.cardId)

  const rowClasses = [
    'ip-row',
    isUnresolved && 'ip-row--unresolved',
    isActive && 'ip-row--active',
    row.confidence === 'fuzzy' && 'ip-row--fuzzy',
    row.confidence === 'ambiguous' && 'ip-row--ambiguous',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <tr className={rowClasses}>
      <td className="ip-cell-played">
        {isLeader ? (
          <button
            type="button"
            className={`ip-star ${isActiveLeader ? 'ip-star--active' : ''}`}
            onClick={onToggleLeader}
            title={isActiveLeader ? 'Active leader' : 'Set as active leader'}
          >
            {isActiveLeader ? '★' : '☆'}
          </button>
        ) : isBase ? (
          <button
            type="button"
            className={`ip-star ${isActiveBase ? 'ip-star--active' : ''}`}
            onClick={onToggleBase}
            title={isActiveBase ? 'Active base' : 'Set as active base'}
          >
            {isActiveBase ? '★' : '☆'}
          </button>
        ) : (
          <QtyCell
            value={row.deckQty}
            onInc={onIncDeck}
            onDec={onDecDeck}
            disableInc={row.deckQty >= row.poolQty || row.deckQty >= 6}
            disableDec={row.deckQty === 0}
          />
        )}
      </td>
      <td className="ip-cell-total">
        {isLeader || isBase ? (
          <span className="ip-row__qty-static">{row.poolQty}</span>
        ) : (
          <QtyCell
            value={row.poolQty}
            onInc={onIncPool}
            onDec={onDecPool}
            disableInc={row.poolQty >= 6}
            disableDec={row.poolQty === 0}
          />
        )}
      </td>
      <td className="ip-cell-no">{cardNumber || '—'}</td>
      <td
        className="ip-cell-name"
        style={
          row.card?.imageUrl
            ? ({ ['--card-art' as any]: `url("${row.card.imageUrl}")` } as React.CSSProperties)
            : undefined
        }
      >
        <button type="button" className="ip-cell-name__btn" onClick={onPickCard}>
          <span className="ip-row__name-text">
            <strong>{row.card?.name || row.extracted.name || 'Unrecognized'}</strong>
            {row.card?.subtitle && <em>{row.card.subtitle}</em>}
            {!row.card?.subtitle && row.confidence === 'ambiguous' && row.candidates.length > 0 && (
              <em className="ip-row__hint">{row.candidates.length} candidates — tap to choose</em>
            )}
            {row.confidence === 'fuzzy' && (
              <em className="ip-row__hint">fuzzy match — tap to verify</em>
            )}
            {isUnresolved && <em className="ip-row__hint">tap to pick a card</em>}
          </span>
          {needsAttention && hasSourceImage && (
            <span
              className="ip-row__source-btn"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onViewSource()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  onViewSource()
                }
              }}
              title="Compare against your source sheet"
            >
              📷
            </span>
          )}
        </button>
      </td>
    </tr>
  )
}

function QtyCell({
  value,
  onInc,
  onDec,
  disableInc,
  disableDec,
}: {
  value: number
  onInc: () => void
  onDec: () => void
  disableInc: boolean
  disableDec: boolean
}) {
  return (
    <div className="ip-qty">
      <button
        type="button"
        className="ip-qty__btn"
        onClick={onDec}
        disabled={disableDec}
        aria-label="decrease"
      >
        −
      </button>
      <span className="ip-qty__value">{value}</span>
      <button
        type="button"
        className="ip-qty__btn"
        onClick={onInc}
        disabled={disableInc}
        aria-label="increase"
      >
        +
      </button>
    </div>
  )
}

// === Helpers ===

function extractCardNumber(cardId: string | undefined): string {
  if (!cardId) return ''
  const match = cardId.match(/[-_](\d+)$/)
  if (!match) return ''
  return parseInt(match[1], 10).toString()
}

interface SectionGroup {
  key: string
  displayName: string
  aspects: string[]
  rows: ResolvedRow[]
}

/**
 * Group resolved rows for display:
 *   1. "Leaders" section first
 *   2. "Bases" section second
 *   3. Aspect groups for everything else
 *
 * `showOnlyPool` filters out rows with poolQty=0.
 */
function groupRows(rows: ResolvedRow[], showOnlyPool: boolean): SectionGroup[] {
  const visible = showOnlyPool ? rows.filter((r) => r.poolQty > 0) : rows

  const leaders: ResolvedRow[] = []
  const bases: ResolvedRow[] = []
  const aspectMap = new Map<string, ResolvedRow[]>()

  for (const row of visible) {
    if (row.card?.isLeader) {
      leaders.push(row)
      continue
    }
    if (row.card?.isBase) {
      bases.push(row)
      continue
    }
    let key = 'unresolved'
    if (row.card) {
      key = getAspectCombinationKey({
        aspects: row.card.aspects,
        type: row.card.type,
      })
    }
    if (!aspectMap.has(key)) aspectMap.set(key, [])
    aspectMap.get(key)!.push(row)
  }

  const result: SectionGroup[] = []

  if (leaders.length > 0) {
    result.push({ key: 'leaders', displayName: 'Leaders', aspects: [], rows: leaders })
  }
  if (bases.length > 0) {
    result.push({ key: 'bases', displayName: 'Bases', aspects: [], rows: bases })
  }

  // Sort aspect groups by aspect priority (Vigilance > Command > Aggression > Cunning, then Heroism/Villainy, then doubles, then Neutral)
  const aspectKeys = [...aspectMap.keys()]
  aspectKeys.sort(compareAspectKeys)
  for (const key of aspectKeys) {
    const aspects = aspectsFromKey(key)
    const displayName = key === 'unresolved' ? 'Unrecognized' : getAspectCombinationDisplayName(key)
    result.push({ key, displayName, aspects, rows: aspectMap.get(key)! })
  }

  return result
}

function aspectsFromKey(key: string): string[] {
  if (key === 'unresolved' || key === 'neutral') return []
  return key
    .split('_')
    .map((a) => a.charAt(0).toUpperCase() + a.slice(1))
    .filter((a) => (ASPECT_NAMES as readonly string[]).includes(a))
}

function compareAspectKeys(a: string, b: string): number {
  // Priority: single aspects (in canonical order) → double-primary → double-mixed → neutral → unresolved
  const order = (k: string): number => {
    if (k === 'unresolved') return 1000
    if (k === 'neutral') return 500
    const parts = k.split('_')
    if (parts.length === 1) {
      const idx = ASPECT_NAMES.findIndex((a) => a.toLowerCase() === parts[0])
      return idx >= 0 ? idx : 100
    }
    // Double aspect — sort after singles
    const primary = ASPECT_NAMES.findIndex((a) => a.toLowerCase() === parts[0])
    const secondary = ASPECT_NAMES.findIndex((a) => a.toLowerCase() === parts[1])
    return 200 + (primary >= 0 ? primary : 50) * 10 + (secondary >= 0 ? secondary : 50)
  }
  return order(a) - order(b)
}
