// @ts-nocheck
'use client'

import { useMemo, useState } from 'react'
import Button from '../Button'
import CardPickerModal from './CardPickerModal'
import {
  getAspectCombinationKey,
  getAspectCombinationDisplayName,
} from '../../utils/aspectCombinations'
import type { useImportPool, ResolvedRow, MatchedCard } from '../../hooks/useImportPool'

interface Props {
  importPool: ReturnType<typeof useImportPool>
}

/**
 * ResolveStep — Step 2 of the Import Pool wizard (U8).
 *
 * Registration-sheet-style table layout. Card art is a full-bleed background
 * on the NAME column; rows are 2 lines tall; columns mirror physical sheets:
 *   PLAYED (deck qty) | TOTAL (pool qty) | NO (card #) | NAME
 *
 * Leaders/bases are toggled active by clicking the star in the PLAYED column.
 */
export default function ResolveStep({ importPool }: Props) {
  const { state, validation, setRowQty, replaceRowCard, setActiveLeader, setActiveBase, goBack, goToConfirm } =
    importPool

  const [pickerFor, setPickerFor] = useState<{
    rowKey: string
    candidates: MatchedCard[]
    typeFilter?: string
  } | null>(null)

  const setCode = state.extraction?.header.setCode || ''

  // Group resolved rows by aspect combination, mirroring the registration sheet layout.
  const grouped = useMemo(() => groupByAspect(state.resolvedRows), [state.resolvedRows])

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
        <RunningTotals validation={validation} />
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
                  <span className="ip-section__title">{group.displayName}</span>
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
  onIncPool: () => void
  onDecPool: () => void
  onIncDeck: () => void
  onDecDeck: () => void
  onToggleLeader: () => void
  onToggleBase: () => void
  onPickCard: () => void
}

function RowItem({
  row,
  isActiveLeader,
  isActiveBase,
  onIncPool,
  onDecPool,
  onIncDeck,
  onDecDeck,
  onToggleLeader,
  onToggleBase,
  onPickCard,
}: RowItemProps) {
  const isLeader = !!row.card?.isLeader
  const isBase = !!row.card?.isBase
  const isActive = isActiveLeader || isActiveBase
  const isUnresolved = !row.card
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
  // "LAW-085" → "85"
  const match = cardId.match(/[-_](\d+)$/)
  if (!match) return ''
  return parseInt(match[1], 10).toString()
}

function groupByAspect(rows: ResolvedRow[]): Array<{ key: string; displayName: string; rows: ResolvedRow[] }> {
  const groups = new Map<string, ResolvedRow[]>()

  for (const row of rows) {
    let key = 'unresolved'
    if (row.card) {
      key = getAspectCombinationKey({
        aspects: row.card.aspects,
        type: row.card.type,
      })
    }
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  return [...groups.entries()].map(([key, rs]) => ({
    key,
    displayName: key === 'unresolved' ? 'Unrecognized' : getAspectCombinationDisplayName(key),
    rows: rs,
  }))
}
