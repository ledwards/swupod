// @ts-nocheck
'use client'

import { useMemo } from 'react'
import Button from '../Button'
import type { useImportPool } from '../../hooks/useImportPool'

interface Props {
  importPool: ReturnType<typeof useImportPool>
}

/**
 * ConfirmStep — Step 3 of the Import Pool wizard (U9).
 *
 * Shows the auto-composed title (editable) + roster summary, then POSTs to
 * /api/import-pool/create. Redirect happens in the parent wizard via
 * the `done` phase + shareId.
 */
export default function ConfirmStep({ importPool }: Props) {
  const { state, validation, setTitle, goBack, submit } = importPool

  const isSubmitting = state.phase === 'submitting'
  const isDone = state.phase === 'done'

  const summary = useMemo(() => {
    const leaderRow = state.resolvedRows.find((r) => r.card?.id === state.activeLeaderId)
    const baseRow = state.resolvedRows.find((r) => r.card?.id === state.activeBaseId)
    const aspectBreakdown: Record<string, number> = {}
    let deckCount = 0
    let sideboardCount = 0
    for (const row of state.resolvedRows) {
      if (!row.card || row.card.isLeader || row.card.isBase) continue
      deckCount += row.deckQty
      sideboardCount += row.poolQty - row.deckQty
      const primary = row.card.aspects?.[0] || 'Neutral'
      aspectBreakdown[primary] = (aspectBreakdown[primary] || 0) + row.deckQty
    }
    return { leader: leaderRow?.card, base: baseRow?.card, aspectBreakdown, deckCount, sideboardCount }
  }, [state])

  return (
    <section className="import-pool-step import-pool-step--confirm">
      <h2>Confirm and create</h2>
      <p className="import-pool-help">
        Give your imported pool a name. You'll land in the deckbuilder with the marked deck pre-loaded.
      </p>

      <div className="import-pool-form-row">
        <label htmlFor="import-pool-title">Pool name</label>
        <input
          id="import-pool-title"
          type="text"
          value={state.title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          disabled={isSubmitting || isDone}
        />
        <small>{state.title.length} / 80</small>
      </div>

      <div className="import-pool-summary">
        <div className="import-pool-summary-leader-base">
          {summary.leader && (
            <figure>
              <img src={summary.leader.imageUrl} alt={summary.leader.name} />
              <figcaption>
                <strong>{summary.leader.name}</strong>
                {summary.leader.subtitle && <span>{summary.leader.subtitle}</span>}
                <small>Leader</small>
              </figcaption>
            </figure>
          )}
          {summary.base && (
            <figure>
              <img src={summary.base.imageUrl} alt={summary.base.name} />
              <figcaption>
                <strong>{summary.base.name}</strong>
                <small>Base</small>
              </figcaption>
            </figure>
          )}
        </div>

        <dl className="import-pool-summary-stats">
          <div>
            <dt>Deck</dt>
            <dd>{summary.deckCount} cards</dd>
          </div>
          <div>
            <dt>Sideboard</dt>
            <dd>{summary.sideboardCount} cards</dd>
          </div>
          <div>
            <dt>Total pool</dt>
            <dd>{validation.poolCount} cards</dd>
          </div>
        </dl>

        {Object.keys(summary.aspectBreakdown).length > 0 && (
          <div className="import-pool-summary-aspects">
            <h4>Deck aspect breakdown</h4>
            <ul>
              {Object.entries(summary.aspectBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([aspect, count]) => (
                  <li key={aspect}>
                    {aspect}: {count}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      {state.error && (
        <div className="import-pool-error" role="alert">
          <strong>Couldn't create pool:</strong> {state.error.message}
          {state.error.details && Array.isArray(state.error.details) && (
            <ul>
              {state.error.details.map((d: any, i: number) => (
                <li key={i}>{d.message || JSON.stringify(d)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="import-pool-actions">
        <Button variant="back" onClick={goBack} disabled={isSubmitting || isDone}>
          ← Back
        </Button>
        <div className="import-pool-actions-spacer" />
        <Button
          variant="primary"
          onClick={submit}
          disabled={isSubmitting || isDone || state.title.trim().length === 0}
        >
          {isDone ? 'Loading deckbuilder…' : isSubmitting ? 'Creating pool…' : 'Create Pool'}
        </Button>
      </div>
    </section>
  )
}
