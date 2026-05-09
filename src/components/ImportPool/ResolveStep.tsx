// @ts-nocheck
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '../Button'
import { AspectIcon } from '../AspectIcon'
import CardPickerModal from './CardPickerModal'
import { SideBySideTable, CroppedView } from './SourceImageModal'
import { CardPreview } from '../DeckBuilder/CardPreview'
import { useCardPreview } from '../../hooks/useCardPreview'
import {
  getAspectCombinationKey,
  getAspectCombinationDisplayName,
} from '../../utils/aspectCombinations'
import type { useImportPool, ResolvedRow, MatchedCard } from '../../hooks/useImportPool'
import { buildAnomalies, type Anomaly as BuiltAnomaly } from '../../services/importPool/buildAnomalies'

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
    dismissAnomaly,
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

  // Anomaly building is delegated to the pure service module so the
  // production wizard and the eval harness use the SAME logic — no drift.
  // See src/services/importPool/buildAnomalies.ts for the rules.
  type Anomaly = BuiltAnomaly

  const allAnomalies = useMemo<Anomaly[]>(
    () =>
      buildAnomalies({
        resolvedRows: state.resolvedRows as any,
        sectionGaps: state.sectionGaps,
        poolCount: validation.poolCount,
        poolTarget: validation.poolTarget,
        deckCount: validation.deckCount,
        deckTarget: validation.deckTarget,
      }),
    [
      state.resolvedRows,
      state.sectionGaps,
      validation.poolCount,
      validation.poolTarget,
      validation.deckCount,
      validation.deckTarget,
    ],
  )

  // Filter out anomalies the user has dismissed via "Mark as correct".
  // Dismissal keys are reset on every fresh extraction, so this set is
  // always scoped to the current run.
  const anomalies = useMemo<Anomaly[]>(
    () => allAnomalies.filter((a) => !state.dismissedAnomalyKeys.includes(a.key)),
    [allAnomalies, state.dismissedAnomalyKeys],
  )

  const anomalyKeys = anomalies.map((a) => a.targetId)

  const [anomalyIndex, setAnomalyIndex] = useState(0)
  // Keep index in bounds when the anomaly list changes
  useEffect(() => {
    if (anomalyIndex >= anomalyKeys.length && anomalyKeys.length > 0) setAnomalyIndex(0)
  }, [anomalyKeys, anomalyIndex])

  // Scroll to a DOM target by id, with a momentary flash highlight. If the
  // row is currently hidden by the Pool/Deck filter, flip to All first so
  // the row exists in the DOM, then scroll on the next paint. Shared by
  // the issue pager (prev/next) and the explicit "Jump to row" button.
  const scrollToTargetId = useCallback(
    (targetId: string) => {
      const scrollTo = (el: HTMLElement) => {
        // block:'start' lands the row at the top of the visible area;
        // scroll-margin-top in CSS pushes it just below the sticky bars.
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        el.classList.add('ip-row--flash')
        setTimeout(() => el.classList.remove('ip-row--flash'), 900)
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
    [state.viewFilter, setViewFilter],
  )

  const goToAnomaly = useCallback(
    (delta: number) => {
      if (anomalies.length === 0) return
      const next = (anomalyIndex + delta + anomalies.length) % anomalies.length
      setAnomalyIndex(next)
      scrollToTargetId(anomalies[next].targetId)
    },
    [anomalies, anomalyIndex, scrollToTargetId],
  )

  // "Jump to row" button on the issue detail strip — scrolls to the
  // currently-shown anomaly's row without changing the index.
  const jumpToCurrentAnomaly = useCallback(() => {
    const targetId = anomalies[anomalyIndex]?.targetId
    if (targetId) scrollToTargetId(targetId)
  }, [anomalies, anomalyIndex, scrollToTargetId])

  // "Mark as correct" — dismiss the current anomaly. The hook's reducer
  // appends to dismissedAnomalyKeys, the filtered `anomalies` memo
  // re-derives, and the index-bounds effect (above) snaps the pager onto
  // the next available issue. Persisted via the slim shape so a refresh
  // doesn't re-show what the user already verified.
  const dismissCurrentAnomaly = useCallback(() => {
    const key = anomalies[anomalyIndex]?.key
    if (key) dismissAnomaly(key)
  }, [anomalies, anomalyIndex, dismissAnomaly])

  const currentAnomalyLabel = anomalies[anomalyIndex]?.label || ''

  // Build the SECTION_TABS list — 10 tabs in canonical sheet order.
  // Each tab carries a label, an icon renderer, a row-predicate, and the
  // bounds-name to match against state.sectionBounds for the image crop.
  const sectionTabs = useMemo(() => buildSectionTabs(), [])

  // Active tab state — defaults to first (Leaders) on mount.
  const [activeSectionKey, setActiveSectionKey] = useState<string>(sectionTabs[0].key)
  const activeIdx = sectionTabs.findIndex((t) => t.key === activeSectionKey)
  const activeSection = sectionTabs[activeIdx >= 0 ? activeIdx : 0]
  const prevSectionKey = activeIdx > 0 ? sectionTabs[activeIdx - 1].key : null
  const nextSectionKey = activeIdx >= 0 && activeIdx < sectionTabs.length - 1
    ? sectionTabs[activeIdx + 1].key : null

  // Rows for the active section (alphabetical by name; SideBySideTable
  // handles sub-grouping inside).
  const activeRows = useMemo(
    () => state.resolvedRows.filter((r) => activeSection.matches(r)),
    [state.resolvedRows, activeSection],
  )

  // Issue rows for yellow-highlighting + per-tab counts.
  const issueRowKeys = useMemo(() => {
    const set = new Set<string>()
    for (const a of anomalies) {
      if (a.kind === 'row') {
        const m = a.targetId.match(/^ip-row-(.+)$/)
        if (m) set.add(m[1])
      }
    }
    return set
  }, [anomalies])

  const issueCountsBySection = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const tab of sectionTabs) {
      counts[tab.key] = state.resolvedRows.filter(
        (r) => tab.matches(r) && issueRowKeys.has(r.key),
      ).length
    }
    return counts
  }, [sectionTabs, state.resolvedRows, issueRowKeys])

  return (
    <section className="import-pool-step import-pool-step--resolve">
      <header className="import-pool-resolve-header">
        <h2>Review Pool Registration</h2>
        <RunningTotals validation={validation} />
        <p className="import-pool-help">
          Page through each section. Compare your printed sheet on the left against
          the imported data on the right. Yellow rows are flagged — review carefully.
        </p>
      </header>

      <SectionTabs
        tabs={sectionTabs}
        activeKey={activeSectionKey}
        onSelect={setActiveSectionKey}
        issueCounts={issueCountsBySection}
      />

      <div className="ip-section-pager">
        <button
          type="button"
          className="ip-section-pager__arrow ip-section-pager__arrow--prev"
          onClick={() => prevSectionKey && setActiveSectionKey(prevSectionKey)}
          disabled={!prevSectionKey}
          aria-label="Previous section"
          title="Previous section"
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <SectionPanel
          activeSection={activeSection}
          rows={activeRows}
          images={state.images}
          sectionBounds={state.sectionBounds}
          setRowQty={setRowQty}
          setActiveLeader={setActiveLeader}
          setActiveBase={setActiveBase}
          activeLeaderId={state.activeLeaderId}
          activeBaseId={state.activeBaseId}
          issueRowKeys={issueRowKeys}
          // Leaders/Bases tabs collapse to a single sub-group — no header rows.
          hideSubGroups={activeSection.key === 'leaders' || activeSection.key === 'bases'}
          // Inline ✓ on flagged rows: dismiss every row-anomaly that points at
          // this row, so the yellow tint goes away.
          onDismissRow={(rowKey) => {
            for (const a of anomalies) {
              if (a.kind === 'row' && a.targetId === `ip-row-${rowKey}`) {
                dismissAnomaly(a.key)
              }
            }
          }}
        />

        <button
          type="button"
          className="ip-section-pager__arrow ip-section-pager__arrow--next"
          onClick={() => nextSectionKey && setActiveSectionKey(nextSectionKey)}
          disabled={!nextSectionKey}
          aria-label="Next section"
          title="Next section"
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="import-pool-actions">
        <Button variant="back" onClick={goBack}>← Previous</Button>
        <div className="import-pool-actions-spacer" />
        <Button variant="primary" onClick={goToConfirm}>Done →</Button>
      </div>

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

// === Section tabs / panel ===

interface SectionTab {
  key: string
  label: string
  boundsName: string
  matches: (row: ResolvedRow) => boolean
  iconNode: () => React.ReactNode
}

function buildSectionTabs(): SectionTab[] {
  const isLeader = (r: ResolvedRow) => !!r.card?.isLeader || r.extracted.type === 'Leader'
  const isBase = (r: ResolvedRow) => !!r.card?.isBase || r.extracted.type === 'Base'
  const aspectsOf = (r: ResolvedRow): string[] => r.card?.aspects || []
  const MAIN_SET = new Set(['Vigilance', 'Command', 'Aggression', 'Cunning'])
  const SEC_SET = new Set(['Heroism', 'Villainy'])

  const isAspectMatch = (target: string) => (r: ResolvedRow) => {
    if (isLeader(r) || isBase(r)) return false
    const aspects = aspectsOf(r)
    const mains = aspects.filter((a) => MAIN_SET.has(a))
    const secs = aspects.filter((a) => SEC_SET.has(a))
    if (mains.length >= 2) return false // multicolor
    if (mains.length === 1) return mains[0] === target
    if (secs.length >= 1) return secs[0] === target
    return false
  }

  const isMulticolor = (r: ResolvedRow) => {
    if (isLeader(r) || isBase(r)) return false
    const mains = aspectsOf(r).filter((a) => MAIN_SET.has(a))
    return mains.length >= 2
  }

  const isNeutral = (r: ResolvedRow) => {
    if (isLeader(r) || isBase(r)) return false
    const aspects = aspectsOf(r)
    return aspects.length === 0
  }

  const aspectTab = (key: string, label: string): SectionTab => ({
    key,
    label,
    boundsName: label,
    matches: isAspectMatch(label),
    iconNode: () => <AspectIcon aspect={label} size="md" />,
  })

  // Inline SVG icons for the non-aspect tabs.
  const HumanIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="6" r="3.2" />
      <path d="M5.5 21c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5z" />
    </svg>
  )
  const HomeIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3 3 11h2v9h5v-6h4v6h5v-9h2z" />
    </svg>
  )
  const HexagonIcon = ({ fill }: { fill: string }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill={fill} stroke="rgba(255,255,255,0.4)" strokeWidth="0.7" />
    </svg>
  )
  const RainbowHexagon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="rainbow-hex-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff4d4d" />
          <stop offset="33%" stopColor="#ffcc33" />
          <stop offset="66%" stopColor="#33cc66" />
          <stop offset="100%" stopColor="#3366ff" />
        </linearGradient>
      </defs>
      <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="url(#rainbow-hex-grad)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.7" />
    </svg>
  )

  return [
    { key: 'leaders', label: 'Leaders', boundsName: 'Leaders', matches: isLeader, iconNode: () => <HumanIcon /> },
    { key: 'bases', label: 'Bases', boundsName: 'Bases', matches: isBase, iconNode: () => <HomeIcon /> },
    aspectTab('vigilance', 'Vigilance'),
    aspectTab('command', 'Command'),
    aspectTab('aggression', 'Aggression'),
    aspectTab('cunning', 'Cunning'),
    aspectTab('villainy', 'Villainy'),
    aspectTab('heroism', 'Heroism'),
    { key: 'neutral', label: 'Neutral', boundsName: 'NoAspect', matches: isNeutral, iconNode: () => <HexagonIcon fill="#666" /> },
    { key: 'multicolor', label: 'Multicolor', boundsName: 'Multicolor', matches: isMulticolor, iconNode: () => <RainbowHexagon /> },
  ]
}

function SectionTabs({
  tabs,
  activeKey,
  onSelect,
  issueCounts,
}: {
  tabs: SectionTab[]
  activeKey: string
  onSelect: (key: string) => void
  issueCounts: Record<string, number>
}) {
  return (
    <div className="ip-section-tabs" role="tablist">
      {tabs.map((tab) => {
        const issues = issueCounts[tab.key] || 0
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === activeKey}
            className={`ip-section-tab ${tab.key === activeKey ? 'ip-section-tab--active' : ''} ${issues > 0 ? 'ip-section-tab--has-issues' : ''}`}
            onClick={() => onSelect(tab.key)}
            title={`${tab.label}${issues > 0 ? ` — ${issues} flagged` : ''}`}
          >
            {tab.iconNode()}
            {issues > 0 && <span className="ip-section-tab__badge">{issues}</span>}
          </button>
        )
      })}
    </div>
  )
}

function SectionPanel({
  activeSection,
  rows,
  images,
  sectionBounds,
  setRowQty,
  setActiveLeader,
  setActiveBase,
  activeLeaderId,
  activeBaseId,
  issueRowKeys,
  hideSubGroups,
  onDismissRow,
}: {
  activeSection: SectionTab
  rows: ResolvedRow[]
  images: any[]
  sectionBounds: any[]
  setRowQty: any
  setActiveLeader: any
  setActiveBase: any
  activeLeaderId: string | null
  activeBaseId: string | null
  issueRowKeys: Set<string>
  hideSubGroups?: boolean
  onDismissRow?: (rowKey: string) => void
}) {
  // Bounds for THIS section across photos (could be 1-2).
  const boundsForSection = useMemo(
    () => sectionBounds.filter((b) => b.name === activeSection.boundsName).sort((a, b) => a.photoIndex - b.photoIndex),
    [sectionBounds, activeSection.boundsName],
  )

  return (
    <div className="ip-section-panel">
      <div className="ip-section-panel__image">
        {images.length === 0 ? (
          <div className="ip-section-panel__empty">
            Source images aren't loaded for this session. Re-upload to see the original sheet here.
          </div>
        ) : boundsForSection.length === 0 ? (
          <div className="ip-section-panel__empty">
            We don't have crop bounds for {activeSection.label}. Showing the table only.
          </div>
        ) : (
          <div className="ip-section-panel__crops">
            {boundsForSection.map((b, i) => {
              const photo = images[b.photoIndex]
              if (!photo) return null
              return (
                <CroppedView
                  key={`${b.name}-${b.photoIndex}-${i}`}
                  src={photo.previewUrl}
                  naturalWidth={photo.width}
                  naturalHeight={photo.height}
                  bounds={b}
                  captionLabel={boundsForSection.length > 1 ? `Page ${b.photoIndex + 1}` : null}
                />
              )
            })}
          </div>
        )}
      </div>
      <div className="ip-section-panel__table">
        {rows.length === 0 ? (
          <div className="ip-section-panel__empty">
            No cards in {activeSection.label}.
          </div>
        ) : (
          <SideBySideTable
            rows={rows}
            setRowQty={setRowQty}
            setActiveLeader={setActiveLeader}
            setActiveBase={setActiveBase}
            activeLeaderId={activeLeaderId}
            activeBaseId={activeBaseId}
            issueRowKeys={issueRowKeys}
            hideSubGroups={hideSubGroups}
            onDismissRow={onDismissRow}
          />
        )}
      </div>
    </div>
  )
}

// === Sub-components ===

/**
 * ImportSummaryAndIssues — gap banner + interactive bulleted issue list.
 *
 * Replaces the old "extraction had warnings" panel. Shows a short status
 * sentence ("Import is missing 4 cards in pool and over by 2 in deck.") and
 * lists every surfaced anomaly with inline action buttons:
 *   - jump-to-row arrow (scrolls the table)
 *   - mark-as-correct ✓ (dismisses; auto-advances to next issue)
 *   - eyeglass (when source images are available, opens crop view)
 */
function ImportSummaryAndIssues({
  poolCount,
  poolTarget,
  deckCount,
  deckTarget,
  anomalies,
  activeKey,
  onJump,
  onDismiss,
  onView,
  imagesAvailable,
}: {
  poolCount: number
  poolTarget: number
  deckCount: number
  deckTarget: number
  anomalies: Array<{ key: string; kind: string; targetId: string; label: string; sectionName: string | null }>
  activeKey: string | null
  onJump: (targetId: string) => void
  onDismiss: (key: string, idx: number) => void
  onView: (sectionName: string | null) => void
  imagesAvailable: boolean
}) {
  // Plain-English status: "missing N", "over by N", or "correct".
  const summary = (count: number, target: number, noun: 'cards in pool' | 'cards in deck') => {
    if (count === target) return `correct in ${noun.replace('cards in ', '')}`
    if (count < target) return `missing ${target - count} ${noun}`
    return `over by ${count - target} ${noun}`
  }
  const headLine =
    poolCount === poolTarget && deckCount === deckTarget
      ? 'Pool and deck counts match. Verify the issues below.'
      : `Import is ${summary(poolCount, poolTarget, 'cards in pool')} and ${summary(deckCount, deckTarget, 'cards in deck')}.`

  if (anomalies.length === 0) {
    // Both totals could match AND the panel be silent — nothing to verify.
    return (
      <div className="import-pool-warnings import-pool-warnings--ok" role="status">
        <strong>{headLine}</strong>
        <small>No issues to verify.</small>
      </div>
    )
  }

  return (
    <div className="import-pool-warnings" role="alert">
      <strong>{headLine}</strong>
      <p className="import-pool-warnings__lead">Please review the following potential issues:</p>
      <ul className="import-pool-issues">
        {anomalies.map((a, idx) => (
          <li
            key={a.key}
            className={`import-pool-issues__item ${activeKey === a.key ? 'import-pool-issues__item--active' : ''}`}
          >
            <button
              type="button"
              className="ip-anomaly-source-btn"
              onClick={() => onJump(a.targetId)}
              title="Jump to row in the table"
              aria-label="Jump to row"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="2" y1="8" x2="13" y2="8" />
                <polyline points="9 4 13 8 9 12" />
              </svg>
            </button>
            <span className="import-pool-issues__label">{a.label}</span>
            <button
              type="button"
              className="ip-anomaly-source-btn"
              onClick={() => onDismiss(a.key, idx)}
              title="Mark as correct"
              aria-label="Mark as correct"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 8.5 6.5 12 13 4" />
              </svg>
            </button>
            {imagesAvailable && (
              <button
                type="button"
                className="ip-anomaly-source-btn"
                onClick={() => onView(a.sectionName)}
                title="View this section in the source image"
                aria-label="View source"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="7" cy="7" r="5" />
                  <line x1="11" y1="11" x2="14" y2="14" />
                </svg>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

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

const MAIN_ASPECTS = new Set(['Vigilance', 'Command', 'Aggression', 'Cunning'])
const SECONDARY_ASPECTS = new Set(['Heroism', 'Villainy'])

/** Map a row to the section name (matching SECTION_NAME_BY_GROUP_KEY values)
 *  the source-image modal can crop to. Returns null if we can't identify
 *  the section (e.g. unmatched row with no card data) — the eyeglass then
 *  opens the full sheet. */
function sectionNameForRow(row: ResolvedRow): string | null {
  const card = row.card
  if (!card) {
    // Best-effort fallback from the extracted type alone.
    if (row.extracted.type === 'Leader') return 'Leaders'
    if (row.extracted.type === 'Base') return 'Bases'
    return null
  }
  if (card.isLeader) return 'Leaders'
  if (card.isBase) return 'Bases'
  const aspects: string[] = card.aspects || []
  const mains = aspects.filter((a) => MAIN_ASPECTS.has(a))
  const secs = aspects.filter((a) => SECONDARY_ASPECTS.has(a))
  if (mains.length >= 2) return 'Multicolor'
  if (mains.length === 1) return mains[0]
  if (secs.length >= 1) return secs[0]
  return 'NoAspect'
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

  // Alphabetical leaders/bases too — same reason as below.
  const byName = (a: ResolvedRow, b: ResolvedRow) =>
    (a.card?.name || a.extracted.name || '').localeCompare(b.card?.name || b.extracted.name || '')
  if (leaders.length > 0) {
    result.push({ key: 'leaders', displayName: 'LEADERS', aspects: [], rows: [...leaders].sort(byName) })
  }
  if (bases.length > 0) {
    result.push({ key: 'bases', displayName: 'BASES', aspects: [], rows: [...bases].sort(byName) })
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
    // Within each sub-group, rows go in the same alphabetical order the
    // physical sheet uses — so scanning the table side-by-side with the
    // photo lines up. Card-number sort would not (the sheet sorts by name).
    const subGroups: SubGroup[] = subKeys.map((subKey) => ({
      key: subKey,
      displayName:
        subKey === '_unresolved' ? 'UNRECOGNIZED' : getAspectCombinationDisplayName(subKey),
      aspects: subKey === '_unresolved' ? [] : aspectsFromKey(subKey),
      rows: [...subs.get(subKey)!].sort((a, b) => {
        const an = a.card?.name || a.extracted.name || ''
        const bn = b.card?.name || b.extracted.name || ''
        return an.localeCompare(bn)
      }),
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
