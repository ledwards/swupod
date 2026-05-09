// @ts-nocheck
'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '../Button'
import { AspectIcon } from '../AspectIcon'
import type { ProcessedImage } from '../../services/importPool/imagePrep'
import type { SectionBounds, ResolvedRow } from '../../hooks/useImportPool'

interface Props {
  images: ProcessedImage[]
  onClose: () => void
  /** When set, the modal opens cropped to this section's bounds across all
   *  photos that contain it. User can toggle back to the full sheet. */
  sectionFilter?: string | null
  sectionBounds?: SectionBounds[]
  /** Side-by-side editing: when these are provided AND sectionFilter is set
   *  AND we're in cropping mode, the modal renders the section's image on
   *  the left and an editable table for the same section on the right.
   *  Edits write through to wizard state via the same callbacks the main
   *  Step-2 page uses, so closing the modal preserves the changes. */
  rowsForSection?: ResolvedRow[]
  setRowQty?: (key: string, field: 'poolQty' | 'deckQty', value: number) => void
  setActiveLeader?: (cardId: string) => void
  setActiveBase?: (cardId: string) => void
  activeLeaderId?: string | null
  activeBaseId?: string | null
}

/**
 * SourceImageModal — view the original sheet images at full size so the user
 * can verify the import against the source.
 *
 * Pinch-to-zoom on touch devices works natively. On desktop, scroll-wheel +
 * cmd/ctrl zooms via the browser; we also add a tap-to-zoom toggle that
 * doubles the rendered size.
 *
 * When a sectionFilter is provided AND we have bounds for that section, the
 * modal opens cropped to just that section. The user can flip back to the
 * full sheet via the toggle in the header.
 */
export default function SourceImageModal({
  images,
  onClose,
  sectionFilter = null,
  sectionBounds = [],
  rowsForSection,
  setRowQty,
  setActiveLeader,
  setActiveBase,
  activeLeaderId,
  activeBaseId,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  // When opened with a section filter, default to "show only that section";
  // toggle button lets the user pop out to the full sheet.
  const [showFullSheet, setShowFullSheet] = useState(false)

  // Lock body scroll
  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [])

  // ESC closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Filter to the bounds entries for this section, sorted by photo order.
  // A section can span multiple photos (e.g. Multicolor continues onto photo 2).
  const sectionEntries = useMemo(() => {
    if (!sectionFilter) return []
    return sectionBounds
      .filter((b) => b.name === sectionFilter)
      .sort((a, b) => a.photoIndex - b.photoIndex)
  }, [sectionFilter, sectionBounds])

  // If we were asked to crop but Claude didn't return bounds for this
  // section, fall through to the full-sheet view rather than showing nothing.
  const haveCrop = sectionEntries.length > 0
  const cropping = !!sectionFilter && haveCrop && !showFullSheet

  // For the full-sheet view, navigate by photo tab. For the cropped view,
  // ALL matching crops render in the modal so the user can scan all the
  // section's content at once (rare to have a section span both photos but
  // we handle it).
  const active = images[activeIndex]

  return (
    <div
      className="ip-source-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="ip-source-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ip-source-modal__header">
          <h3>
            {cropping ? `Source · ${sectionFilter} section` : 'Source sheet'}
          </h3>
          <div className="ip-source-modal__actions">
            {!cropping && images.length > 1 && (
              <div className="ip-source-modal__tabs">
                {images.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`ip-source-modal__tab ${i === activeIndex ? 'ip-source-modal__tab--active' : ''}`}
                    onClick={() => setActiveIndex(i)}
                  >
                    Page {i + 1}
                  </button>
                ))}
              </div>
            )}
            {sectionFilter && haveCrop && (
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setShowFullSheet((v) => !v)}
                title={showFullSheet ? 'Show only this section' : 'Show the entire sheet'}
              >
                {showFullSheet ? 'Crop' : 'Full sheet'}
              </Button>
            )}
            <Button variant="secondary" size="xs" onClick={() => setZoomed((z) => !z)}>
              {zoomed ? 'Fit' : 'Zoom'}
            </Button>
            <Button variant="icon" size="sm" onClick={onClose} aria-label="Close">
              ×
            </Button>
          </div>
        </header>

        <div className={`ip-source-modal__body ${cropping && rowsForSection ? 'ip-source-modal__body--split' : ''}`}>
          <div
            className={`ip-source-modal__viewport ${zoomed ? 'is-zoomed' : ''}`}
            onClick={() => setZoomed((z) => !z)}
          >
            {images.length === 0 ? (
              <div className="ip-source-modal__empty">
                <p>
                  Source images aren&apos;t loaded for this session. They were dropped from
                  local storage to save space — re-upload them to see the original sheet
                  here.
                </p>
              </div>
            ) : cropping ? (
              <div className="ip-source-modal__crops">
                {sectionEntries.map((b, i) => {
                  const photo = images[b.photoIndex]
                  if (!photo) return null
                  return (
                    <CroppedView
                      key={`${b.name}-${b.photoIndex}-${i}`}
                      src={photo.previewUrl}
                      naturalWidth={photo.width}
                      naturalHeight={photo.height}
                      bounds={b}
                      captionLabel={
                        sectionEntries.length > 1
                          ? `Page ${b.photoIndex + 1} of ${images.length}`
                          : null
                      }
                    />
                  )
                })}
              </div>
            ) : (
              active && (
                <img
                  src={active.previewUrl}
                  alt={`Source sheet ${activeIndex + 1}`}
                  className="ip-source-modal__img"
                />
              )
            )}
          </div>
          {/* Side-by-side editable table for the focused section. Same data,
              same edit path as the main Step-2 page — changes here are saved
              to wizard state in real time. */}
          {cropping && rowsForSection && setRowQty && (
            <SideBySideTable
              rows={rowsForSection}
              setRowQty={setRowQty}
              setActiveLeader={setActiveLeader}
              setActiveBase={setActiveBase}
              activeLeaderId={activeLeaderId ?? null}
              activeBaseId={activeBaseId ?? null}
            />
          )}
        </div>
        {cropping && !haveCrop && (
          <div className="ip-source-modal__hint">
            We don&apos;t have bounds for this section yet — showing the full sheet.
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * SideBySideTable — minimal editable table rendered alongside the cropped
 * source image. Each row gets PLAYED (deck) and TOTAL (pool) +/- buttons
 * exactly like the main Step-2 table, plus active leader/base toggles.
 *
 * Data flows through the same setRowQty / setActiveLeader / setActiveBase
 * callbacks the main page uses, so closing the modal preserves edits.
 *
 * Order matches the printed sheet:
 *   - Group rows by aspect-combination (sub-section)
 *   - Sub-sections in canonical order (pure first, then secondary-aspect
 *     doubles by V, C, A, U, H, V order)
 *   - Within each sub-section, alphabetical by card name
 */
const MAIN_SET = new Set(['Vigilance', 'Command', 'Aggression', 'Cunning'])
const SECONDARY_SET = new Set(['Heroism', 'Villainy'])
const ASPECT_RANK = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Heroism', 'Villainy']

function subKeyForRow(row: ResolvedRow): string {
  // PRESERVE catalog aspect order — major/minor distinction matters.
  // ["Cunning", "Vigilance"] (U-major) and ["Vigilance", "Cunning"] (V-major)
  // are different cards on the printed sheet and live in different
  // sub-sections. Sorting alphabetically would collapse them.
  const aspects: string[] = (row.card?.aspects || []).slice()
  if (aspects.length === 0) return 'neutral'
  return aspects.join('_').toLowerCase()
}

function compareSubKeysForSection(a: string, b: string, primary: string): number {
  // Order matches the printed sheet's sub-sections.
  //
  // For a primary-aspect section (e.g. Vigilance):
  //   1. X + Villainy
  //   2. X + Heroism
  //   3. X + X (double-pip if exists)
  //   4. X + (other main, by canonical V/C/A/U)
  //   5. X (pure single, alone) — last
  //
  // For Multicolor (no single primary): sort by canonical priority of the
  // lead-aspect, then by the follow-aspect. So V-pairs first (VC, VA, VU),
  // then C-pairs (CA, CU), then A-pairs (AU).
  const MAIN_ORDER = ['vigilance', 'command', 'aggression', 'cunning']
  const ALL_ORDER = [...MAIN_ORDER, 'heroism', 'villainy']
  const lowerPrimary = primary ? primary.toLowerCase() : ''

  const scoreSection = (k: string): number => {
    if (k === '_unresolved') return 1_000_000
    const parts = k.split('_').filter(Boolean)
    if (parts.length === 1) return 999_900 // pure last
    const others = parts.filter((p) => p !== lowerPrimary)
    if (others.length === 0) return 30 // double-pip (X + X)
    const other = others[0]
    if (other === 'villainy') return 10
    if (other === 'heroism') return 20
    const mainIdx = MAIN_ORDER.indexOf(other)
    return 40 + (mainIdx >= 0 ? mainIdx : 9)
  }

  const scoreMulticolor = (k: string): number => {
    if (k === '_unresolved') return 1_000_000
    const parts = k.split('_').filter(Boolean)
    if (parts.length === 1) return 999_900
    // Lead = FIRST aspect from catalog (the major-cost aspect). Follow =
    // second aspect. Without sorting, "vigilance_cunning" (V-major) and
    // "cunning_vigilance" (U-major) sort distinctly: V-majors first
    // (lead=0), U-majors later (lead=3). Mirrors the printed sheet.
    const lead = ALL_ORDER.indexOf(parts[0])
    const follow = parts[1] ? ALL_ORDER.indexOf(parts[1]) : -1
    if (lead < 0) return 999
    return lead * 100 + (follow >= 0 ? follow : 99)
  }

  const score = primary ? scoreSection : scoreMulticolor
  return score(a) - score(b)
}

export function SideBySideTable({
  rows,
  setRowQty,
  setActiveLeader,
  setActiveBase,
  activeLeaderId,
  activeBaseId,
  issueRowKeys,
  hideSubGroups,
  onDismissRow,
}: {
  rows: ResolvedRow[]
  setRowQty: (key: string, field: 'poolQty' | 'deckQty', value: number) => void
  setActiveLeader?: (cardId: string) => void
  setActiveBase?: (cardId: string) => void
  activeLeaderId: string | null
  activeBaseId: string | null
  /** Row keys flagged by the anomaly logic — get a yellow row tint. */
  issueRowKeys?: Set<string>
  /** Skip sub-section dividers (used for Leaders/Bases tabs where every row
   *  is the same conceptual type). */
  hideSubGroups?: boolean
  /** Called when the user clicks ✓ on a flagged row — dismisses associated
   *  anomalies. Without this, no checkmark renders. */
  onDismissRow?: (rowKey: string) => void
}) {
  // Determine the section's primary aspect from any row that has one.
  // (All rows passed in already share a section.) For Multicolor sections —
  // where every row has 2+ main aspects — we return empty so the sub-key
  // sort falls into the canonical-pair ordering instead.
  const primary = useMemo(() => {
    const allMulti = rows.length > 0 && rows.every((r) => {
      const mains = (r.card?.aspects || []).filter((a) => MAIN_SET.has(a))
      return mains.length >= 2
    })
    if (allMulti) return ''
    for (const r of rows) {
      const aspects = r.card?.aspects || []
      const main = aspects.find((a) => MAIN_SET.has(a))
      if (main) return main
      const sec = aspects.find((a) => SECONDARY_SET.has(a))
      if (sec) return sec
    }
    return ''
  }, [rows])

  const subGroups = useMemo(() => {
    const groups = new Map<string, ResolvedRow[]>()
    for (const r of rows) {
      const k = subKeyForRow(r)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(r)
    }
    const sortedKeys = [...groups.keys()].sort((a, b) => compareSubKeysForSection(a, b, primary))
    return sortedKeys.map((key) => ({
      key,
      rows: groups.get(key)!.sort((a, b) =>
        (a.card?.name || a.extracted.name || '').localeCompare(b.card?.name || b.extracted.name || ''),
      ),
    }))
  }, [rows, primary])

  return (
    <div className="ip-source-modal__pane">
      <table className="ip-source-modal__table">
        <colgroup>
          <col className="ip-source-modal__col-played" />
          <col className="ip-source-modal__col-total" />
          <col className="ip-source-modal__col-name" />
        </colgroup>
        <thead>
          <tr>
            <th>PLAYED</th>
            <th>TOTAL</th>
            <th>NAME</th>
          </tr>
        </thead>
        <tbody>
          {subGroups.flatMap((group, gi) => {
            // Sub-section header: aspect icons of this group's combination.
            // Skipped entirely when hideSubGroups (Leaders/Bases tabs) or when
            // there's only one sub-group (no point in a header).
            const showHeader = !hideSubGroups && subGroups.length > 1
            const dividerRow = showHeader
              ? [
                  <tr key={`sub-${group.key}`} className="ip-source-modal__sub-header">
                    <td colSpan={3}>
                      <SubGroupHeader subKey={group.key} />
                    </td>
                  </tr>,
                ]
              : []
            const dataRows = group.rows.map((row) => {
              const isLeader = !!row.card?.isLeader
              const isBase = !!row.card?.isBase
              const isActiveLeader = !!row.card && row.card.id === activeLeaderId
              const isActiveBase = !!row.card && row.card.id === activeBaseId
              const isActive = isActiveLeader || isActiveBase
              const flagged = issueRowKeys?.has(row.key)
              return (
                <tr key={row.key} className={`ip-source-modal__row ${flagged ? 'ip-source-modal__row--flagged' : ''}`}>
                  <td className="ip-source-modal__cell ip-source-modal__cell--qty">
                    {isLeader || isBase ? (
                      <button
                        type="button"
                        className={`ip-source-modal__qty-toggle ${isActive ? 'ip-source-modal__qty-toggle--active' : ''}`}
                        onClick={() => {
                          if (!row.card) return
                          if (isLeader && setActiveLeader) setActiveLeader(row.card.id)
                          else if (isBase && setActiveBase) setActiveBase(row.card.id)
                        }}
                        title={isActive ? 'Active selection' : `Set as active ${isLeader ? 'leader' : 'base'}`}
                      >
                        {row.deckQty}
                      </button>
                    ) : (
                      <QtyControls
                        value={row.deckQty}
                        onInc={() => setRowQty(row.key, 'deckQty', row.deckQty + 1)}
                        onDec={() => setRowQty(row.key, 'deckQty', row.deckQty - 1)}
                        disableInc={row.deckQty >= row.poolQty || row.deckQty >= 6}
                        disableDec={row.deckQty <= 0}
                      />
                    )}
                  </td>
                  <td className="ip-source-modal__cell ip-source-modal__cell--qty">
                    {/* All cards (incl. leaders/bases) get +/- on TOTAL.
                        Active leader/base selection lives on the PLAYED column
                        as a single-click toggle. */}
                    <QtyControls
                      value={row.poolQty}
                      onInc={() => setRowQty(row.key, 'poolQty', row.poolQty + 1)}
                      onDec={() => setRowQty(row.key, 'poolQty', row.poolQty - 1)}
                      disableInc={row.poolQty >= 6}
                      disableDec={row.poolQty <= 0}
                    />
                  </td>
                  <td className="ip-source-modal__cell ip-source-modal__cell--name">
                    <span className="ip-source-modal__name">
                      <strong>{row.card?.name || row.extracted.name || 'Unrecognized'}</strong>
                      {row.card?.subtitle && <em>{row.card.subtitle}</em>}
                    </span>
                    {flagged && onDismissRow && (
                      <button
                        type="button"
                        className="ip-source-modal__row-confirm"
                        onClick={() => onDismissRow(row.key)}
                        title="Mark as correct (dismiss the issue)"
                        aria-label="Mark as correct"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 8.5 6.5 12 13 4" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              )
            })
            return [...dividerRow, ...dataRows]
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Render a sub-group header showing the aspect icons of that combination.
 *  e.g. for sub-key "vigilance_villainy" → renders V + Villainy icons. */
function SubGroupHeader({ subKey }: { subKey: string }) {
  if (subKey === '_unresolved') {
    return <span className="ip-source-modal__sub-header-label">UNRECOGNIZED</span>
  }
  const aspects = subKey.split('_').filter(Boolean).map((a) => a.charAt(0).toUpperCase() + a.slice(1))
  return (
    <span className="ip-source-modal__sub-header-label">
      {aspects.map((a, i) => (
        <span key={`${a}-${i}`} className="ip-source-modal__sub-header-icon">
          <AspectIcon aspect={a} size="sm" />
        </span>
      ))}
    </span>
  )
}

function QtyControls({
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
    <div className="ip-source-modal__qty">
      <button type="button" className="ip-source-modal__qty-btn" onClick={onDec} disabled={disableDec} aria-label="decrease">−</button>
      <span className={`ip-source-modal__qty-value ${value === 0 ? 'ip-source-modal__qty-value--zero' : ''}`}>{value}</span>
      <button type="button" className="ip-source-modal__qty-btn" onClick={onInc} disabled={disableInc} aria-label="increase">+</button>
    </div>
  )
}

/** Renders a region of an image cropped to normalized [0,1] bounds. We use a
 *  fixed-aspect-ratio container clipping a positioned <img> rather than a
 *  canvas crop so the original photo's natural resolution is preserved (no
 *  re-encoding) and so the browser handles decoding/scaling. */
export function CroppedView({
  src,
  naturalWidth,
  naturalHeight,
  bounds,
  captionLabel,
}: {
  src: string
  naturalWidth: number
  naturalHeight: number
  bounds: SectionBounds
  captionLabel: string | null
}) {
  const dx = Math.max(0.001, bounds.x1 - bounds.x0)
  const dy = Math.max(0.001, bounds.y1 - bounds.y0)
  // Section's own aspect ratio = (cropped width in px) / (cropped height in px)
  const sectionAspect = (dx * naturalWidth) / (dy * naturalHeight)

  return (
    <div className="ip-source-crop">
      {captionLabel && <div className="ip-source-crop__caption">{captionLabel}</div>}
      <div
        className="ip-source-crop__viewport"
        style={{ aspectRatio: `${sectionAspect}` }}
      >
        <img
          src={src}
          alt=""
          style={{
            position: 'absolute',
            // Position the image so the section's top-left lands at
            // container (0, 0) and the section's width fills the container.
            left: `${(-bounds.x0 * 100) / dx}%`,
            top: `${(-bounds.y0 * 100) / dy}%`,
            width: `${100 / dx}%`,
            height: 'auto',
            maxWidth: 'none',
            display: 'block',
          }}
        />
      </div>
    </div>
  )
}
