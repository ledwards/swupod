'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import { AspectIcon } from '@/src/components/AspectIcon'
import Button from '@/src/components/Button'
import ContentSkeleton from '@/src/components/ContentSkeleton'
import { SiteTitle } from '@/src/components/SiteTheme'
import { getAllSetCodes } from '@/src/utils/setConfigs'
import { countUniqueShowcases, sortForExport } from './showcaseTable'
import { useShowcaseData, useShowcaseTable } from './useShowcaseCollection'
import ShowcaseExport from './ShowcaseExport'
import './showcase-collection.css'

const SUBTITLE = 'Every Showcase leader you have pulled'

/** The same picture glyph the legacy page uses for its export action. */
function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

/**
 * The themed Showcase Collection (alpha): how many Showcase leaders you have,
 * your cards scattered on the table to drag and flip, and Export as Image.
 */
export default function ShowcaseCollection() {
  const { user, loading } = useAuth() as { user: { id?: string; username?: string } | null; loading: boolean }
  const router = useRouter()
  const { showcases, cards, total, loading: loadingShowcases } = useShowcaseData(user?.id)
  const tableRef = useRef<HTMLElement>(null)
  const ids = useMemo(() => showcases.map(s => s.id), [showcases])
  const table = useShowcaseTable(ids, tableRef)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/')
  }, [user, loading, router])

  if (loading || (user && loadingShowcases)) {
    return (
      <div className="scc-page">
        <SiteTitle subtitle={SUBTITLE}>Showcase Collection</SiteTitle>
        <ContentSkeleton kind="card" count={4} />
      </div>
    )
  }
  if (!user) return null

  if (!showcases.length) {
    return (
      <div className="scc-page">
        <SiteTitle subtitle={SUBTITLE}>Showcase Collection</SiteTitle>
        <div className="scc-panel scc-empty">
          <div className="scc-ghosts" aria-hidden="true"><span /><span /></div>
          <h2>No Showcase Leaders Yet</h2>
          <p>Play Sealed to find rare Showcase leaders. They appear in about 1 in 288 packs.</p>
          <Button variant="primary" onClick={() => router.push('/sealed')}>Play Sealed</Button>
        </div>
      </div>
    )
  }

  const owned = countUniqueShowcases(showcases, cards)
  const count = `${owned} / ${total}`
  const pct = total ? Math.min(100, Math.round((owned / total) * 100)) : 0

  return (
    <div className="scc-page">
      <SiteTitle subtitle={SUBTITLE}>Showcase Collection</SiteTitle>

      <div className="scc-panel scc-bar">
        <div className="scc-count">
          <strong>{count}</strong>
          <div className="scc-progress" role="img" aria-label={`${owned} of ${total} Showcase leaders collected`}><span style={{ width: `${pct}%` }} /></div>
          <span className="scc-meta">Showcase leaders collected</span>
        </div>
        <Button variant="primary" onClick={() => setExporting(true)} disabled={exporting}><ImageIcon />Export as Image</Button>
      </div>

      <section ref={tableRef} className="scc-table" style={{ minHeight: table.tableHeight }} aria-label="Your Showcase leaders">
        {showcases.map(leader => {
          const card = cards[leader.cardId]
          const pos = table.positions[leader.id]
          if (!pos) return null
          const isFlipped = Boolean(table.flipped[leader.id])
          const isDragging = table.dragging === leader.id
          const name = `${leader.cardName}${leader.cardSubtitle ? `, ${leader.cardSubtitle}` : ''}`
          return (
            <button
              key={leader.id}
              type="button"
              className={`scc-card${isFlipped ? ' is-flipped' : ''}${isDragging ? ' is-dragging' : ''}`}
              style={{ left: pos.x, top: pos.y, zIndex: pos.zIndex, width: table.size.width, height: table.size.height, transform: `rotate(${pos.rotation + (isDragging ? table.tilt : 0)}deg)` }}
              aria-label={`${name}, Showcase${isFlipped ? ', flipped to back' : ''}. Flip card`}
              aria-pressed={isFlipped}
              onPointerDown={e => table.onPointerDown(leader.id, e)}
              onClick={() => table.onClick(leader.id)}
            >
              <span className="scc-card-inner">
                <span className="scc-face scc-face--front">
                  <img src={card?.imageUrl || undefined} alt="" draggable={false} />
                  <span className="scc-chip">{leader.setCode}</span>
                  {card?.aspects?.length ? (
                    <span className="scc-aspects">{card.aspects.map(a => <AspectIcon key={a} aspect={a} size="sm" />)}</span>
                  ) : null}
                </span>
                <span className="scc-face scc-face--back">
                  <img src={card?.backImageUrl || card?.imageUrl || undefined} alt="" draggable={false} />
                </span>
              </span>
            </button>
          )
        })}
        <p className="scc-hint">Drag cards to arrange them. Tap a card to flip it.</p>
      </section>

      <ShowcaseExport
        open={exporting}
        onClose={() => setExporting(false)}
        title={`Showcase Collection (${count})`}
        username={user.username || ''}
        sorted={sortForExport(showcases, cards, getAllSetCodes())}
        cards={cards}
      />
    </div>
  )
}
