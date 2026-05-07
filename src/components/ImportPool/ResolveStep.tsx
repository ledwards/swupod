// @ts-nocheck
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '../Button'
import { AspectIcon } from '../AspectIcon'
import CardPickerModal from './CardPickerModal'
import SourceImageModal from './SourceImageModal'
import { CardPreview } from '../DeckBuilder/CardPreview'
import { useCardPreview } from '../../hooks/useCardPreview'
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
    setViewFilter,
    setViewMode,
  } = importPool

  const [pickerFor, setPickerFor] = useState<{
    rowKey: string
    candidates: MatchedCard[]
    typeFilter?: string
  } | null>(null)

  // Two pieces of source-modal state:
  //   - open: is the modal visible at all?
  //   - section: when set, the modal opens cropped to this section name; null
  //     means "show the full sheet" (the toolbar Source button).
  const [sourceModalOpen, setSourceModalOpen] = useState(false)
  const [sourceModalSection, setSourceModalSection] = useState<string | null>(null)
  const openSourceFor = useCallback((section: string | null) => {
    setSourceModalSection(section)
    setSourceModalOpen(true)
  }, [])

  const cardPreview = useCardPreview()

  const setCode = state.extraction?.header.setCode || ''

  const grouped = useMemo(
    () => groupRows(state.resolvedRows, state.viewFilter),
    [state.resolvedRows, state.viewFilter],
  )

  // Build the list of "anomalies" — things the user should manually verify.
  // Three classes:
  //   1. Section-level gaps (under/over-populated vs typical sealed pool)
  //   2. Per-row Claude vision confidence: medium/low
  //   3. Per-row matcher confidence: unresolved, fuzzy, ambiguous, deckQty>poolQty
  type Anomaly =
    | { kind: 'section'; targetId: string; label: string }
    | { kind: 'row'; targetId: string; label: string }

  const anomalies = useMemo<Anomaly[]>(() => {
    const list: Anomaly[] = []
    const seenRowKey = new Set<string>()
    const pushRow = (row: ResolvedRow, label: string) => {
      if (seenRowKey.has(row.key)) return
      seenRowKey.add(row.key)
      list.push({ kind: 'row', targetId: `ip-row-${row.key}`, label })
    }

    // 1) Section-level gaps (Multicolor under-count, etc.) come first.
    for (const gap of state.sectionGaps) {
      list.push({
        kind: 'section',
        targetId: `ip-section-${gap.section.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        label: gap.message,
      })
    }

    // 2) Per-row matcher problems for rows the user actually has.
    for (const row of state.resolvedRows) {
      if (row.poolQty <= 0) continue
      const cardName = row.card?.name || row.extracted.name || 'Unrecognized'
      if (!row.card) {
        pushRow(row, `Unmatched: ${cardName}`)
        continue
      }
      if (row.confidence === 'ambiguous') {
        pushRow(row, `Ambiguous match: ${cardName}`)
        continue
      }
      if (row.confidence === 'fuzzy') {
        pushRow(row, `Fuzzy match: ${cardName}`)
        continue
      }
      if (row.deckQty > row.poolQty) {
        pushRow(row, `Bad qty: ${cardName} deck>${row.poolQty}`)
        continue
      }
    }

    // 3) ALL low-confidence reads, regardless of qty.
    for (const row of state.resolvedRows) {
      const cardName = row.card?.name || row.extracted.name || 'Unrecognized'
      if (row.extracted.poolQtyConfidence === 'low') {
        pushRow(
          row,
          row.poolQty === 0
            ? `Uncertain blank (pool): ${cardName}`
            : `Uncertain pool=${row.poolQty}: ${cardName}`,
        )
      }
      if (row.extracted.deckQtyConfidence === 'low') {
        pushRow(
          row,
          row.deckQty === 0
            ? `Uncertain blank (deck): ${cardName}`
            : `Uncertain deck=${row.deckQty}: ${cardName}`,
        )
      }
    }

    // 4) When pool is SHORT by N cards, surface the N most-suspicious
    //    poolQty=0 rows so the user has a focused list of candidates to
    //    verify against the source. "Most-suspicious" = lowest pool
    //    confidence first (low → medium). Skip leaders/bases (their
    //    typical state IS poolQty=0). This is the answer to "Pool: 80/96
    //    means 16 issues" — every missing card maps to one entry here.
    const poolShort = validation.poolCount < validation.poolTarget
    if (poolShort) {
      const poolDelta = validation.poolTarget - validation.poolCount
      const candidates = state.resolvedRows
        .filter(
          (r) =>
            !seenRowKey.has(r.key) &&
            r.poolQty === 0 &&
            r.extracted.type !== 'Leader' &&
            r.extracted.type !== 'Base',
        )
        .map((r) => ({ r, score: confScore(r.extracted.poolQtyConfidence) }))
        // Lowest confidence first, then by extracted name for stability.
        .sort((a, b) => a.score - b.score || a.r.extracted.name.localeCompare(b.r.extracted.name))
        .slice(0, poolDelta)
      for (const { r } of candidates) {
        const cardName = r.card?.name || r.extracted.name || 'Unrecognized'
        pushRow(r, `Possibly missed: ${cardName}`)
      }
    }

    // 5) When deck is OVER target, surface the N most-suspicious deck
    //    inclusions (deckQty>0 rows with the LOWEST deck confidence). The
    //    user clicks through to verify each against the source and bumps
    //    deckQty down if Claude over-counted. Skip leaders/bases (active
    //    selection is exactly one of each, deckQty=1 is by definition).
    const deckOver = validation.deckCount > validation.deckTarget
    if (deckOver) {
      const deckDelta = validation.deckCount - validation.deckTarget
      const candidates = state.resolvedRows
        .filter(
          (r) =>
            !seenRowKey.has(r.key) &&
            r.deckQty > 0 &&
            r.extracted.type !== 'Leader' &&
            r.extracted.type !== 'Base',
        )
        .map((r) => ({ r, score: confScore(r.extracted.deckQtyConfidence) }))
        .sort((a, b) => a.score - b.score || a.r.extracted.name.localeCompare(b.r.extracted.name))
        .slice(0, deckDelta)
      for (const { r } of candidates) {
        const cardName = r.card?.name || r.extracted.name || 'Unrecognized'
        pushRow(r, `Possibly mis-counted in deck: ${cardName} (deck=${r.deckQty})`)
      }
    }

    return list
  }, [state.resolvedRows, state.sectionGaps, validation.poolCount, validation.poolTarget, validation.deckCount, validation.deckTarget])

  const anomalyKeys = anomalies.map((a) => a.targetId)

  const [anomalyIndex, setAnomalyIndex] = useState(0)
  // Keep index in bounds when the anomaly list changes
  useEffect(() => {
    if (anomalyIndex >= anomalyKeys.length && anomalyKeys.length > 0) setAnomalyIndex(0)
  }, [anomalyKeys, anomalyIndex])

  const goToAnomaly = useCallback(
    (delta: number) => {
      if (anomalies.length === 0) return
      const next = (anomalyIndex + delta + anomalies.length) % anomalies.length
      setAnomalyIndex(next)
      const targetId = anomalies[next].targetId

      // If the target isn't in the DOM (rows are hidden by Pool/Deck filter),
      // flip to All so the row renders, then scroll on the next paint.
      const scrollTo = (el: HTMLElement) => {
        // block:'start' lands the row at the top of the visible area;
        // scroll-margin-top in CSS pushes it just below the sticky bars.
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        el.classList.add('ip-row--flash')
        setTimeout(() => el.classList.remove('ip-row--flash'), 1400)
      }

      const el = document.getElementById(targetId)
      if (el) {
        scrollTo(el)
        return
      }
      if (state.viewFilter !== 'all') {
        setViewFilter('all')
        requestAnimationFrame(() => {
          const retried = document.getElementById(targetId)
          if (retried) scrollTo(retried)
        })
      }
    },
    [anomalies, anomalyIndex, state.viewFilter, setViewFilter],
  )

  const currentAnomalyLabel = anomalies[anomalyIndex]?.label || ''

  return (
    <section className="import-pool-step import-pool-step--resolve">
      <header className="import-pool-resolve-header">
        <h2>Review Pool Registration</h2>
        {state.warnings.length > 0 && (
          <div className="import-pool-warnings" role="alert">
            <strong>Heads up — some rows needed cleanup during import:</strong>
            <ul>
              {state.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <small>Fix anything that doesn't look right below before continuing.</small>
          </div>
        )}
      </header>

      <div className="ip-sticky-stack">
      <div className="ip-toolbar">
        <RunningTotals validation={validation} />
        <div className="ip-toolbar__group">
          <div className="ip-toggle-group" role="group" aria-label="View mode">
            <Button
              variant="toggle"
              glowColor="blue"
              size="sm"
              active={state.viewMode === 'table'}
              onClick={() => setViewMode('table')}
              title="Table view"
              aria-pressed={state.viewMode === 'table'}
            >
              <ViewToggleListIcon />
            </Button>
            <Button
              variant="toggle"
              glowColor="blue"
              size="sm"
              active={state.viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
              title="Grid view"
              aria-pressed={state.viewMode === 'grid'}
            >
              <ViewToggleGridIcon />
            </Button>
          </div>
          <div className="ip-toggle-group" role="group" aria-label="Row filter">
            <Button
              variant="toggle"
              glowColor="blue"
              size="sm"
              active={state.viewFilter === 'all'}
              onClick={() => setViewFilter('all')}
              title="Show all sheet rows"
              aria-pressed={state.viewFilter === 'all'}
            >
              All
            </Button>
            <Button
              variant="toggle"
              glowColor="blue"
              size="sm"
              active={state.viewFilter === 'pool'}
              onClick={() => setViewFilter('pool')}
              title="Show only your pool"
              aria-pressed={state.viewFilter === 'pool'}
            >
              Pool
            </Button>
            <Button
              variant="toggle"
              glowColor="blue"
              size="sm"
              active={state.viewFilter === 'deck'}
              onClick={() => setViewFilter('deck')}
              title="Show only your deck"
              aria-pressed={state.viewFilter === 'deck'}
            >
              Deck
            </Button>
          </div>
          {/* Issue pager always renders so the user knows we're checking;
              when there are no anomalies it shows "0 issues" with the arrows
              disabled. find/replace UI pattern. */}
          <div
            className={`ip-error-pager ${anomalies.length === 0 ? 'ip-error-pager--clean' : ''}`}
            role="group"
            aria-label="Issue navigator"
          >
            <button
              type="button"
              className="ip-error-pager__btn"
              onClick={() => goToAnomaly(-1)}
              title="Previous issue"
              aria-label="Previous issue"
              disabled={anomalies.length === 0}
            >
              ←
            </button>
            <span className="ip-error-pager__label" title={currentAnomalyLabel}>
              {anomalies.length === 0
                ? 'No issues'
                : `Issue ${anomalyIndex + 1}/${anomalies.length}`}
            </span>
            <button
              type="button"
              className="ip-error-pager__btn"
              onClick={() => goToAnomaly(1)}
              title="Next issue"
              aria-label="Next issue"
              disabled={anomalies.length === 0}
            >
              →
            </button>
          </div>
          <button
            type="button"
            className="ip-icon-btn"
            onClick={() => openSourceFor(null)}
            title={state.images.length > 0 ? 'View source sheet' : 'Source images aren’t loaded — re-upload to see them'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <span className="ip-icon-btn__label">Source</span>
          </button>
        </div>
      </div>
      {anomalies.length > 0 && currentAnomalyLabel && (
        <div className="ip-anomaly-detail">
          <strong>Issue {anomalyIndex + 1}:</strong> {currentAnomalyLabel}
        </div>
      )}
      </div>{/* /.ip-sticky-stack */}

      {state.viewMode === 'grid' ? (
        <GridView
          grouped={grouped}
          activeLeaderId={state.activeLeaderId}
          activeBaseId={state.activeBaseId}
          hasSourceImages={state.images.length > 0}
          setRowQty={setRowQty}
          setActiveLeader={setActiveLeader}
          setActiveBase={setActiveBase}
          openPicker={(row) =>
            setPickerFor({
              rowKey: row.key,
              candidates: row.candidates,
              typeFilter: row.extracted.type,
            })
          }
          openSource={(sectionName) => openSourceFor(sectionName ?? null)}
          cardPreview={cardPreview}
        />
      ) : (
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
        {grouped.map((group) => {
          const renderRow = (row: ResolvedRow) => (
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
              onCardMouseEnter={cardPreview.handleCardMouseEnter}
              onCardMouseLeave={cardPreview.handleCardMouseLeave}
              onCardTouchStart={cardPreview.handleCardTouchStart}
              onCardTouchEnd={cardPreview.handleCardTouchEnd}
            />
          )

          return (
            <tbody key={group.key} className="ip-section">
              <tr
                className="ip-section-row"
                id={`ip-section-${group.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              >
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
                      <button
                        type="button"
                        className="ip-section__source-btn"
                        onClick={() =>
                          openSourceFor(SECTION_NAME_BY_GROUP_KEY[group.key] || null)
                        }
                        title={state.images.length > 0
                          ? `View source — ${group.displayName} section`
                          : 'Source images aren’t loaded — re-upload to see them'}
                        aria-label={`View source sheet for ${group.displayName}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" />
                          <path d="M21 21l-4.35-4.35" />
                        </svg>
                      </button>
                    </span>
                    <span className="ip-section__count">
                      {group.rows.reduce((s, r) => s + r.deckQty, 0)}
                      {' / '}
                      {group.rows.reduce((s, r) => s + r.poolQty, 0)} cards
                    </span>
                  </div>
                </td>
              </tr>
              {group.subGroups
                ? group.subGroups.flatMap((sub) => [
                    <tr key={`sub-${sub.key}`} className="ip-subsection-row">
                      <td colSpan={4}>
                        <div className="ip-subsection-bar">
                          <span className="ip-subsection__title">
                            {sub.aspects.length > 0 && (
                              <span className="ip-section__icons">
                                {sub.aspects.map((a) => (
                                  <AspectIcon key={a} aspect={a} size="xs" />
                                ))}
                              </span>
                            )}
                            {sub.displayName}
                          </span>
                          <span className="ip-subsection__count">
                            {sub.rows.reduce((s, r) => s + r.deckQty, 0)}
                            {' / '}
                            {sub.rows.reduce((s, r) => s + r.poolQty, 0)}
                          </span>
                        </div>
                      </td>
                    </tr>,
                    ...sub.rows.map(renderRow),
                  ])
                : group.rows.map(renderRow)}
            </tbody>
          )
        })}
      </table>
      )}

      <div className="import-pool-actions">
        <Button variant="back" onClick={goBack}>
          Back
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
          sourceImages={state.images}
          onPick={(card) => replaceRowCard(pickerFor.rowKey, card)}
          onClose={() => setPickerFor(null)}
        />
      )}

      {sourceModalOpen && (
        <SourceImageModal
          images={state.images}
          onClose={() => {
            setSourceModalOpen(false)
            setSourceModalSection(null)
          }}
          sectionFilter={sourceModalSection}
          sectionBounds={state.sectionBounds}
        />
      )}

      {cardPreview.hoveredCardPreview && (
        <CardPreview
          card={cardPreview.hoveredCardPreview.card}
          x={cardPreview.hoveredCardPreview.x}
          y={cardPreview.hoveredCardPreview.y}
          isMobile={cardPreview.hoveredCardPreview.isMobile}
          onDismiss={cardPreview.dismissPreview}
        />
      )}
    </section>
  )
}

// === Sub-components ===

function RunningTotals({ validation }: { validation: any }) {
  // Deck count: <30 is red (illegal), ==30 is green (legal min), >30 is
  // yellow (legal but unusual — over-deckbuilding). User scans per-row
  // confidence % to decide which deck inclusions to drop.
  const deckClass =
    validation.deckCount < validation.deckTarget
      ? 'totals-bad'
      : validation.deckCount > validation.deckTarget
        ? 'totals-warn'
        : 'totals-ok'
  return (
    <div className="import-pool-totals" id="ip-running-totals">
      <span className={validation.poolCount === validation.poolTarget ? 'totals-ok' : 'totals-bad'}>
        Pool: {validation.poolCount} / {validation.poolTarget}
      </span>
      <span className={deckClass}>
        Deck: {validation.deckCount} / {validation.deckTarget}
      </span>
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
  onCardMouseEnter: (card: any, e: any) => void
  onCardMouseLeave: () => void
  onCardTouchStart: (card: any) => void
  onCardTouchEnd: () => void
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
  onCardMouseEnter,
  onCardMouseLeave,
  onCardTouchStart,
  onCardTouchEnd,
}: RowItemProps) {
  const isLeader = !!row.card?.isLeader
  const isBase = !!row.card?.isBase
  const isActive = isActiveLeader || isActiveBase
  const isUnresolved = !row.card
  const needsAttention = isUnresolved || row.confidence === 'fuzzy' || row.confidence === 'ambiguous'
  const cardNumber = extractCardNumber(row.card?.cardId)

  // Per-cell color tier based on the corresponding column's read confidence.
  // Cell background tint replaces the old standalone confidence-percent badge.
  const deckTier = confidenceTierForRow(row, 'deck')
  const poolTier = confidenceTierForRow(row, 'pool')
  // Card name is tinted by the WORSE of the two so a single bad column still
  // draws the eye to the row.
  const nameTier = worseTier(deckTier, poolTier)
  const titleHint = `Deck (PLAYED) read: ${row.extracted.deckQtyConfidence ?? 'unknown'} · Pool (TOTAL) read: ${row.extracted.poolQtyConfidence ?? 'unknown'}`

  const rowClasses = [
    'ip-row',
    isUnresolved && 'ip-row--unresolved',
    isActive && 'ip-row--active',
    row.confidence === 'fuzzy' && 'ip-row--fuzzy',
    row.confidence === 'ambiguous' && 'ip-row--ambiguous',
  ]
    .filter(Boolean)
    .join(' ')

  // Click-to-toggle for leader/base PLAYED cell: flips between deckQty=0 and
  // deckQty=1 via the existing setActive handlers (which take care of
  // unsetting any other active leader/base).
  const handleLeaderBaseToggle = isLeader
    ? onToggleLeader
    : isBase
      ? onToggleBase
      : undefined

  return (
    <tr className={rowClasses} id={`ip-row-${row.key}`}>
      <td className={`ip-cell-played ip-cell-tier--${deckTier}`} title={titleHint}>
        {isLeader || isBase ? (
          <button
            type="button"
            className={`ip-row__qty-toggle ${isActive ? 'ip-row__qty-toggle--active' : ''}`}
            onClick={handleLeaderBaseToggle}
            title={isActive ? 'Active selection' : `Set as active ${isLeader ? 'leader' : 'base'}`}
          >
            {row.deckQty}
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
      <td className={`ip-cell-total ip-cell-tier--${poolTier}`} title={titleHint}>
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
        className={`ip-cell-name ip-cell-tier--${nameTier} ${needsAttention ? 'ip-cell-name--attention' : ''}`}
        style={
          row.card?.imageUrl
            ? ({ ['--card-art' as any]: `url("${row.card.imageUrl}")` } as React.CSSProperties)
            : undefined
        }
        title={titleHint}
      >
        <button
          type="button"
          className="ip-cell-name__btn"
          onClick={onPickCard}
          onMouseEnter={(e) => row.card && onCardMouseEnter(row.card, e)}
          onMouseLeave={onCardMouseLeave}
          onTouchStart={() => row.card && onCardTouchStart(row.card)}
          onTouchEnd={onCardTouchEnd}
        >
          <span className="ip-row__name-text">
            <strong className={needsAttention ? 'ip-row__name--attention' : ''}>
              {row.card?.name || row.extracted.name || 'Unrecognized'}
            </strong>
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

/** Per-cell confidence tier helper. Returns the same enum as
 *  confidenceTier() — high (faded green) / medium (yellow) / low (red) —
 *  for whichever column we're tinting. */
function confidenceTierForRow(row: ResolvedRow, column: 'deck' | 'pool'): 'high' | 'medium' | 'low' {
  const level =
    column === 'deck' ? row.extracted.deckQtyConfidence : row.extracted.poolQtyConfidence
  return confidenceTier(qtyConfPct(level))
}

/** When tinting the card name we use the WORSE tier across the two columns
 *  so a single low-confidence read still surfaces. */
function worseTier(
  a: 'high' | 'medium' | 'low',
  b: 'high' | 'medium' | 'low',
): 'high' | 'medium' | 'low' {
  const order = { high: 0, medium: 1, low: 2 }
  return order[a] > order[b] ? a : b
}

/* View-mode toggle icons — same shapes the deckbuilder uses in
 * src/components/DeckBuilder/ViewModeToggle.tsx so the Import Pool toolbar
 * reads as the same UI pattern. */
function ViewToggleGridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 2H8V8H2V2Z" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M12 2H18V8H12V2Z" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M2 12H8V18H2V12Z" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M12 12H18V18H12V12Z" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  )
}

function ViewToggleListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="3" width="16" height="2" fill="currentColor" />
      <rect x="2" y="7" width="16" height="2" fill="currentColor" />
      <rect x="2" y="11" width="16" height="2" fill="currentColor" />
      <rect x="2" y="15" width="16" height="2" fill="currentColor" />
    </svg>
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
      <span className={`ip-qty__value ${value === 0 ? 'ip-qty__value--zero' : ''}`}>
        {value}
      </span>
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

interface SubGroup {
  key: string
  displayName: string
  aspects: string[]
  rows: ResolvedRow[]
}

interface SectionGroup {
  key: string
  displayName: string
  aspects: string[] // icons for the section header
  rows: ResolvedRow[] // flattened (for total count)
  subGroups?: SubGroup[] // when present, render nested sub-headers within
}

const GAME_SIDES = new Set(['Vigilance', 'Command', 'Aggression', 'Cunning'])
const PLAYER_SIDES = new Set(['Heroism', 'Villainy'])

// Multicolor section icons: all 4 game sides + both player sides, in canonical
// order. Used for both matched (primarySection) and unmatched
// (primarySectionFromAspectGroup) routings, so the section header is
// consistent regardless of which card happened to land first.
const MULTICOLOR_HEADER_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Heroism', 'Villainy']

/** Map from groupRows() primary-section keys to the section names Claude
 *  uses in its bounding-box response. Stays out-of-band so the
 *  hyphen/case-insensitive split-from-key doesn't have to round-trip
 *  through string transforms. */
const SECTION_NAME_BY_GROUP_KEY: Record<string, string> = {
  leaders: 'Leaders',
  bases: 'Bases',
  vigilance: 'Vigilance',
  command: 'Command',
  aggression: 'Aggression',
  cunning: 'Cunning',
  heroism: 'Heroism',
  villainy: 'Villainy',
  multicolor: 'Multicolor',
  'no-aspect': 'NoAspect',
}

/** Numeric score for sorting confidence enums "lowest first". Used by the
 *  anomaly-list builder to rank suspicious rows when pool/deck totals don't
 *  add up — least confident reads bubble to the top. */
function confScore(level: 'high' | 'medium' | 'low' | undefined): number {
  if (level === 'low') return 0
  if (level === 'medium') return 1
  return 2 // high or undefined → least suspicious
}

/** Per-column confidence as a 0–100 % so it can render as a numeric badge.
 *  These map Claude's enum reads of the two qty columns (PLAYED for deck,
 *  TOTAL for pool). Card-name OCR is grounded against the closed card list
 *  and isn't shown — what we care about is the player's handwriting in the
 *  qty columns, since under/over-counts there are the actual failure mode. */
function qtyConfPct(level: 'high' | 'medium' | 'low' | undefined): number {
  if (level === 'high') return 95
  if (level === 'medium') return 65
  if (level === 'low') return 30
  return 65 // missing → assume medium so the badge still reads
}

/** Three-tier color bucket. High is the boring case (matches expectation),
 *  so it renders as faded green that sinks into the row. Medium is yellow.
 *  Low is red — these are the rows the user actually needs to verify. */
function confidenceTier(pct: number): 'high' | 'medium' | 'low' {
  if (pct >= 85) return 'high'
  if (pct >= 50) return 'medium'
  return 'low'
}

/** A card's "primary section" — matches the headers on a real registration sheet:
 *  VIGILANCE / COMMAND / AGGRESSION / CUNNING / HEROISM / VILLAINY / MULTICOLOR / NO ASPECT.
 */
function primarySection(card: { aspects?: string[] }): {
  key: string
  displayName: string
  aspects: string[]
} {
  const aspects = card.aspects || []
  const gameSides = aspects.filter((a) => GAME_SIDES.has(a))
  const playerSides = aspects.filter((a) => PLAYER_SIDES.has(a))

  // Two game-side aspects (e.g. Aggression+Command) → MULTICOLOR. The
  // section header shows ALL aspects (multicolor is the umbrella for any
  // multi-aspect combo) rather than just whichever pair this card has.
  if (gameSides.length >= 2) {
    return { key: 'multicolor', displayName: 'MULTICOLOR', aspects: MULTICOLOR_HEADER_ASPECTS }
  }
  // One game-side aspect (with or without a player side) → that game-side section
  if (gameSides.length === 1) {
    return { key: gameSides[0].toLowerCase(), displayName: gameSides[0].toUpperCase(), aspects: [gameSides[0]] }
  }
  // No game-side, only player side(s) → that player section
  if (playerSides.length === 1) {
    return { key: playerSides[0].toLowerCase(), displayName: playerSides[0].toUpperCase(), aspects: [playerSides[0]] }
  }
  // No aspects at all
  return { key: 'no-aspect', displayName: 'NEUTRAL', aspects: [] }
}

/** Same idea as primarySection() but driven by the raw aspectGroup STRING that
 *  Claude attaches to each extracted row — used for unmatched rows where we
 *  don't have a card object to inspect. Returns null when the string is empty
 *  or unparseable, so the caller falls back to the UNRECOGNIZED bucket.
 *
 *  Examples Claude actually returns:
 *    "Vigilance"            → vigilance section
 *    "Vigilance Heroism"    → vigilance section (single game side + player side)
 *    "Aggression Vigilance" → multicolor section (two game sides)
 *    "Multicolor"           → multicolor section (explicit)
 *    "No Aspect" / "Neutral"→ no-aspect section
 */
function primarySectionFromAspectGroup(aspectGroup: string | null | undefined): {
  key: string
  displayName: string
  aspects: string[]
} | null {
  if (!aspectGroup) return null
  const tokens = aspectGroup
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
  if (tokens.length === 0) return null

  const gameSides: string[] = []
  const playerSides: string[] = []
  for (const t of tokens) {
    const cap = t.charAt(0).toUpperCase() + t.slice(1)
    if (GAME_SIDES.has(cap)) gameSides.push(cap)
    else if (PLAYER_SIDES.has(cap)) playerSides.push(cap)
  }

  if (tokens.includes('multicolor') || gameSides.length >= 2) {
    return { key: 'multicolor', displayName: 'MULTICOLOR', aspects: MULTICOLOR_HEADER_ASPECTS }
  }
  if (gameSides.length === 1) {
    return { key: gameSides[0].toLowerCase(), displayName: gameSides[0].toUpperCase(), aspects: [gameSides[0]] }
  }
  if (playerSides.length === 1) {
    return { key: playerSides[0].toLowerCase(), displayName: playerSides[0].toUpperCase(), aspects: [playerSides[0]] }
  }
  // "No Aspect" / "Neutral" / unrecognized variants
  if (tokens.some((t) => t === 'no' || t === 'neutral' || t === 'aspect')) {
    return { key: 'no-aspect', displayName: 'NEUTRAL', aspects: [] }
  }
  return null
}

/**
 * Group rows for display:
 *   1. Leaders first, Bases second
 *   2. Then primary-aspect sections (matching the registration sheet's headers)
 *      with sub-groups inside for each unique aspect combination
 *
 * `viewFilter` controls visibility:
 *   - 'all'  → every row from the sheet
 *   - 'pool' → only rows with poolQty>0 (default; the player's actual pool)
 *   - 'deck' → only rows with deckQty>0 (just the marked-deck cards)
 */
function groupRows(rows: ResolvedRow[], viewFilter: 'all' | 'pool' | 'deck'): SectionGroup[] {
  const visible =
    viewFilter === 'all'
      ? rows
      : viewFilter === 'deck'
        ? rows.filter((r) => r.deckQty > 0)
        : rows.filter((r) => r.poolQty > 0)

  const leaders: ResolvedRow[] = []
  const bases: ResolvedRow[] = []
  // primaryKey → { meta, subKey → rows }
  const primaryMap = new Map<
    string,
    { meta: ReturnType<typeof primarySection>; subs: Map<string, ResolvedRow[]> }
  >()
  const unresolved: ResolvedRow[] = []

  for (const row of visible) {
    // Matched rows: route by the matched card's aspects.
    if (row.card?.isLeader) {
      leaders.push(row)
      continue
    }
    if (row.card?.isBase) {
      bases.push(row)
      continue
    }
    if (row.card) {
      const meta = primarySection(row.card)
      const subKey = getAspectCombinationKey({
        aspects: row.card.aspects,
        type: row.card.type,
      })
      if (!primaryMap.has(meta.key)) {
        primaryMap.set(meta.key, { meta, subs: new Map() })
      }
      const entry = primaryMap.get(meta.key)!
      if (!entry.subs.has(subKey)) entry.subs.set(subKey, [])
      entry.subs.get(subKey)!.push(row)
      continue
    }

    // Unmatched rows: place them where Claude's aspectGroup says they belong
    // so the user can scan unfamiliar text alongside the matched cards in
    // the same section. Leaders/bases route by extracted type even without a
    // matched card.
    if (row.extracted.type === 'Leader') {
      leaders.push(row)
      continue
    }
    if (row.extracted.type === 'Base') {
      bases.push(row)
      continue
    }
    const meta = primarySectionFromAspectGroup(row.extracted.aspectGroup)
    if (meta) {
      if (!primaryMap.has(meta.key)) {
        primaryMap.set(meta.key, { meta, subs: new Map() })
      }
      const entry = primaryMap.get(meta.key)!
      // Keep unmatched rows in their own subkey within the section so they
      // sort below the matched sub-aspect groups (compareSubKeys puts
      // single-aspect first, then doubles, then this — see score()).
      const subKey = '_unresolved'
      if (!entry.subs.has(subKey)) entry.subs.set(subKey, [])
      entry.subs.get(subKey)!.push(row)
      continue
    }
    unresolved.push(row)
  }

  const result: SectionGroup[] = []

  if (leaders.length > 0) {
    result.push({ key: 'leaders', displayName: 'LEADERS', aspects: [], rows: leaders })
  }
  if (bases.length > 0) {
    result.push({ key: 'bases', displayName: 'BASES', aspects: [], rows: bases })
  }

  // Section order — mirror a real LAW registration sheet
  const PRIMARY_ORDER = [
    'vigilance',
    'command',
    'aggression',
    'cunning',
    'heroism',
    'villainy',
    'multicolor',
    'no-aspect',
  ]
  const sortedPrimaries = [...primaryMap.keys()].sort(
    (a, b) => PRIMARY_ORDER.indexOf(a) - PRIMARY_ORDER.indexOf(b),
  )

  for (const primaryKey of sortedPrimaries) {
    const { meta, subs } = primaryMap.get(primaryKey)!
    const allRows = [...subs.values()].flat()
    // Sub-group order: pure single-aspect first, then doubles, _unresolved last
    const subKeys = [...subs.keys()].sort((a, b) => compareSubKeys(a, b, primaryKey))
    const subGroups: SubGroup[] = subKeys.map((subKey) => ({
      key: subKey,
      displayName:
        subKey === '_unresolved' ? 'UNRECOGNIZED' : getAspectCombinationDisplayName(subKey),
      aspects: subKey === '_unresolved' ? [] : aspectsFromKey(subKey),
      rows: subs.get(subKey)!,
    }))
    result.push({
      key: primaryKey,
      displayName: meta.displayName,
      aspects: meta.aspects,
      rows: allRows,
      // Only show sub-groups if there are 2+ sub-aspect variants in the section
      subGroups: subGroups.length > 1 ? subGroups : undefined,
    })
  }

  if (unresolved.length > 0) {
    result.push({ key: 'unresolved', displayName: 'UNRECOGNIZED', aspects: [], rows: unresolved })
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

/** GridView — alternative rendering of the resolved rows as image-card tiles
 *  organized by aspect section. Hover preview is wired through the same
 *  cardPreview hook the table view uses. */
function GridView({
  grouped,
  activeLeaderId,
  activeBaseId,
  hasSourceImages,
  setRowQty,
  setActiveLeader,
  setActiveBase,
  openPicker,
  openSource,
  cardPreview,
}: {
  grouped: SectionGroup[]
  activeLeaderId: string | null
  activeBaseId: string | null
  hasSourceImages: boolean
  setRowQty: (key: string, field: 'poolQty' | 'deckQty', value: number) => void
  setActiveLeader: (id: string) => void
  setActiveBase: (id: string) => void
  openPicker: (row: ResolvedRow) => void
  openSource: (sectionName: string | null) => void
  cardPreview: ReturnType<typeof useCardPreview>
}) {
  const renderTile = (row: ResolvedRow) => {
    const isLeader = !!row.card?.isLeader
    const isBase = !!row.card?.isBase
    const isActiveLeader = !!row.card && activeLeaderId === row.card.id
    const isActiveBase = !!row.card && activeBaseId === row.card.id
    const isActive = isActiveLeader || isActiveBase
    const isUnresolved = !row.card
    const needsAttention = isUnresolved || row.confidence === 'fuzzy' || row.confidence === 'ambiguous'

    return (
      <div
        key={row.key}
        id={`ip-row-${row.key}`}
        className={`ip-tile ${isActive ? 'ip-tile--active' : ''} ${needsAttention ? 'ip-tile--attention' : ''} ${isUnresolved ? 'ip-tile--unresolved' : ''}`}
      >
        <button
          type="button"
          className="ip-tile__image"
          onClick={() => openPicker(row)}
          onMouseEnter={(e) => row.card && cardPreview.handleCardMouseEnter(row.card, e)}
          onMouseLeave={cardPreview.handleCardMouseLeave}
          onTouchStart={() => row.card && cardPreview.handleCardTouchStart(row.card)}
          onTouchEnd={cardPreview.handleCardTouchEnd}
          title={row.card?.name || 'Unrecognized'}
        >
          {row.card?.imageUrl ? (
            <img src={row.card.imageUrl} alt={row.card.name} loading="lazy" />
          ) : (
            <span className="ip-tile__placeholder">?</span>
          )}
          {row.poolQty > 1 && <span className="ip-tile__count">×{row.poolQty}</span>}
        </button>
        <div className="ip-tile__controls">
          {isLeader || isBase ? (
            <button
              type="button"
              className={`ip-star ${isActiveLeader || isActiveBase ? 'ip-star--active' : ''}`}
              onClick={() => (isLeader ? row.card && setActiveLeader(row.card.id) : row.card && setActiveBase(row.card.id))}
              title={isActive ? 'Active selection' : isLeader ? 'Set as active leader' : 'Set as active base'}
            >
              {isActive ? '★' : '☆'}
            </button>
          ) : (
            <>
              <span className="ip-tile__qty-label">Deck</span>
              <button
                type="button"
                className="ip-qty__btn"
                onClick={() => setRowQty(row.key, 'deckQty', row.deckQty - 1)}
                disabled={row.deckQty === 0}
              >
                −
              </button>
              <span className={`ip-qty__value ${row.deckQty === 0 ? 'ip-qty__value--zero' : ''}`}>
                {row.deckQty}
              </span>
              <button
                type="button"
                className="ip-qty__btn"
                onClick={() => setRowQty(row.key, 'deckQty', row.deckQty + 1)}
                disabled={row.deckQty >= row.poolQty || row.deckQty >= 6}
              >
                +
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="ip-grid-root">
      {grouped.map((group) => (
        <div
          key={group.key}
          className="ip-grid-section"
          id={`ip-section-${group.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        >
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
              <button
                type="button"
                className="ip-section__source-btn"
                onClick={() =>
                  openSource(SECTION_NAME_BY_GROUP_KEY[group.key] || null)
                }
                title={hasSourceImages
                  ? `View source — ${group.displayName} section`
                  : 'Source images aren’t loaded — re-upload to see them'}
                aria-label={`View source sheet for ${group.displayName}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </button>
            </span>
            <span className="ip-section__count">
              {group.rows.reduce((s, r) => s + r.deckQty, 0)}
              {' / '}
              {group.rows.reduce((s, r) => s + r.poolQty, 0)} cards
            </span>
          </div>
          {group.subGroups
            ? group.subGroups.map((sub) => (
                <div key={sub.key} className="ip-grid-subsection">
                  <div className="ip-subsection-bar">
                    <span className="ip-subsection__title">
                      {sub.aspects.length > 0 && (
                        <span className="ip-section__icons">
                          {sub.aspects.map((a) => (
                            <AspectIcon key={a} aspect={a} size="xs" />
                          ))}
                        </span>
                      )}
                      {sub.displayName}
                    </span>
                    <span className="ip-subsection__count">
                      {sub.rows.reduce((s, r) => s + r.deckQty, 0)}
                      {' / '}
                      {sub.rows.reduce((s, r) => s + r.poolQty, 0)}
                    </span>
                  </div>
                  <div className="ip-tile-row">{sub.rows.map(renderTile)}</div>
                </div>
              ))
            : <div className="ip-tile-row">{group.rows.map(renderTile)}</div>}
        </div>
      ))}
    </div>
  )
}

/** Order sub-groups within a primary section: pure single first, then doubles,
 *  then the synthetic "_unresolved" bucket last. */
function compareSubKeys(a: string, b: string, primaryKey: string): number {
  const score = (k: string): number => {
    if (k === '_unresolved') return 1_000_000 // always last
    const parts = k.split('_')
    if (parts.length === 1) return 0 // pure single-aspect first
    // Doubles: order by the OTHER aspect (not the primary)
    const otherIdx = parts.findIndex((p) => p !== primaryKey)
    const other = parts[otherIdx]
    const orderMap = ['vigilance', 'command', 'aggression', 'cunning', 'heroism', 'villainy']
    const idx = orderMap.indexOf(other)
    return 100 + (idx >= 0 ? idx : 50)
  }
  return score(a) - score(b)
}
