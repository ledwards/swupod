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
 * Aspect-grouped review. Lets the user fix unrecognized cards, wrong matches,
 * and quantities. Continue is disabled until validation is clean.
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

  const leaderRows = state.resolvedRows.filter((r) => r.card?.isLeader)
  const baseRows = state.resolvedRows.filter((r) => r.card?.isBase)
  const otherGroups = grouped.filter(
    (g) => g.rows.some((r) => !r.card?.isLeader && !r.card?.isBase) || g.key === 'unresolved',
  )

  return (
    <section className="import-pool-step import-pool-step--resolve">
      <header className="import-pool-resolve-header">
        <h2>Resolve extraction</h2>
        <p className="import-pool-help">
          Review the cards we extracted from your sheet. Fix any unmatched cards, wrong matches,
          or bad quantities. Pool must total 96 cards (1 leader + 1 base + 14 other × 6).
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
        <RunningTotals validation={validation} state={state} />
      </header>

      {/* Leaders */}
      <div className="import-pool-resolve-section">
        <h3>Choose your leader</h3>
        <div className="import-pool-leaders-grid">
          {leaderRows.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() => row.card && setActiveLeader(row.card.id)}
              className={`import-pool-leader-pick ${
                row.card && state.activeLeaderId === row.card.id ? 'active' : ''
              }`}
            >
              {row.card?.imageUrl && <img src={row.card.imageUrl} alt={row.card.name} />}
              <span>
                {row.card?.name || '?'}
                {row.card?.subtitle && <em> · {row.card.subtitle}</em>}
              </span>
            </button>
          ))}
          {leaderRows.length === 0 && (
            <p className="import-pool-empty-hint">
              No leaders extracted yet. Add leader rows below or upload a clearer photo.
            </p>
          )}
        </div>
      </div>

      {/* Bases */}
      <div className="import-pool-resolve-section">
        <h3>Choose your base</h3>
        <div className="import-pool-leaders-grid">
          {baseRows.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() => row.card && setActiveBase(row.card.id)}
              className={`import-pool-leader-pick ${
                row.card && state.activeBaseId === row.card.id ? 'active' : ''
              }`}
            >
              {row.card?.imageUrl && <img src={row.card.imageUrl} alt={row.card.name} />}
              <span>{row.card?.name || '?'}</span>
            </button>
          ))}
          {baseRows.length === 0 && (
            <p className="import-pool-empty-hint">No bases extracted yet.</p>
          )}
        </div>
      </div>

      {/* Aspect-grouped rows */}
      {otherGroups.map((group) => (
        <div key={group.key} className="import-pool-resolve-section">
          <h3 className="import-pool-aspect-header">
            {group.displayName}{' '}
            <span className="import-pool-aspect-count">
              {group.rows.reduce((sum, r) => sum + r.poolQty, 0)} cards
            </span>
          </h3>
          <ul className="import-pool-row-list">
            {group.rows.map((row) => (
              <RowItem
                key={row.key}
                row={row}
                onIncPool={() => setRowQty(row.key, 'poolQty', row.poolQty + 1)}
                onDecPool={() => setRowQty(row.key, 'poolQty', row.poolQty - 1)}
                onIncDeck={() => setRowQty(row.key, 'deckQty', row.deckQty + 1)}
                onDecDeck={() => setRowQty(row.key, 'deckQty', row.deckQty - 1)}
                onPickCard={() =>
                  setPickerFor({
                    rowKey: row.key,
                    candidates: row.candidates,
                    typeFilter: row.extracted.type,
                  })
                }
              />
            ))}
          </ul>
        </div>
      ))}

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

function RunningTotals({ validation, state }: { validation: any; state: any }) {
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

function RowItem({
  row,
  onIncPool,
  onDecPool,
  onIncDeck,
  onDecDeck,
  onPickCard,
}: {
  row: ResolvedRow
  onIncPool: () => void
  onDecPool: () => void
  onIncDeck: () => void
  onDecDeck: () => void
  onPickCard: () => void
}) {
  const isUnresolved = !row.card
  const isAmbiguous = row.confidence === 'ambiguous' && row.candidates.length > 0

  return (
    <li className={`import-pool-row ${isUnresolved ? 'row-unresolved' : ''}`}>
      <button type="button" onClick={onPickCard} className="import-pool-row__card">
        {row.card?.imageUrl ? (
          <img src={row.card.imageUrl} alt={row.card.name} loading="lazy" />
        ) : (
          <span className="import-pool-row__placeholder">?</span>
        )}
        <span className="import-pool-row__name">
          <strong>{row.card?.name || row.extracted.name || 'Unrecognized'}</strong>
          {row.card?.subtitle && <em> · {row.card.subtitle}</em>}
          {isAmbiguous && (
            <small className="import-pool-row__chip">{row.candidates.length} candidates</small>
          )}
          {row.confidence === 'fuzzy' && (
            <small className="import-pool-row__chip import-pool-row__chip--warn">fuzzy match</small>
          )}
        </span>
      </button>

      <div className="import-pool-row__qty-group">
        <span className="import-pool-row__qty-label">Pool</span>
        <Button variant="icon" size="xs" onClick={onDecPool} disabled={row.poolQty === 0}>
          −
        </Button>
        <span className="import-pool-row__qty">{row.poolQty}</span>
        <Button variant="icon" size="xs" onClick={onIncPool} disabled={row.poolQty >= 6}>
          +
        </Button>
      </div>

      <div className="import-pool-row__qty-group">
        <span className="import-pool-row__qty-label">Deck</span>
        <Button variant="icon" size="xs" onClick={onDecDeck} disabled={row.deckQty === 0}>
          −
        </Button>
        <span className="import-pool-row__qty">{row.deckQty}</span>
        <Button
          variant="icon"
          size="xs"
          onClick={onIncDeck}
          disabled={row.deckQty >= row.poolQty || row.deckQty >= 6}
        >
          +
        </Button>
      </div>
    </li>
  )
}

// === Helpers ===

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
