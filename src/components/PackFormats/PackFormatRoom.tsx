'use client'
import { useRouter } from 'next/navigation'
import EntryShell from '../EntryFlow/EntryShell'
import Button from '../Button'
import ContentSkeleton from '../ContentSkeleton'
import CardPreview, { type PreviewCard } from '../DeckBuilder/CardPreview'
import { SiteTitle } from '../SiteTheme'
import { PlayIcon } from '../PodHub/icons'
import { useCardPreview } from '../../hooks/useCardPreview'
import { getCyclingPackImageUrls } from '../../utils/packArt'
import { PACK_FORMATS, alphaPath, deckCardsOf, type PackFormatKey } from './packFormats'
import { PackCardTile } from './PackFormatBits'
import { usePackPool } from './usePackPool'
import './pack-formats.css'

/** The room: your opened packs (leaders, bases, the face-down deck), then one primary, Play. */
export default function PackFormatRoom({ format, shareId }: { format: PackFormatKey; shareId: string }) {
  const f = PACK_FORMATS[format]
  const router = useRouter()
  const { record, error } = usePackPool(shareId)
  const preview = useCardPreview()
  const pool = record?.pool
  const hidden = pool ? deckCardsOf(pool).length : 0
  const packWord = f.packs === 1 ? 'Pack Is' : `${f.packs} Packs Are`

  return (
    <EntryShell setCode={pool?.setCode ?? null} loading={!pool && !error}>
      <div className="pfx-page">
        <SiteTitle subtitle={pool?.setName ?? f.subtitle}>{f.title}</SiteTitle>
        {error ? <p className="pfx-error" role="alert">{error}</p> : !pool ? (
          <><ContentSkeleton kind="row"/><ContentSkeleton kind="card" count={4}/></>
        ) : (
          <>
            <section className="pfx-panel pfx-bar" aria-label="Your packs">
              <div className="pfx-bar-copy">
                <div className="pfx-fan" aria-hidden="true">
                  {getCyclingPackImageUrls(pool.setCode, f.packs).map((src, i) => <img key={i} src={src} alt=""/>)}
                </div>
                <div className="pfx-stack">
                  <p className="pfx-title">Your {packWord} Open</p>
                  <ul className="pfx-chips">
                    <li className="pfx-chip">{pool.leaders.length} {pool.leaders.length === 1 ? 'Leader' : 'Leaders'}</li>
                    <li className="pfx-chip">{pool.bases.length} {pool.bases.length === 1 ? 'Base' : 'Bases'}</li>
                    <li className="pfx-chip">{hidden} Hidden Cards</li>
                  </ul>
                </div>
              </div>
              <Button variant="primary" size="lg" onClick={() => router.push(alphaPath(format, `/${encodeURIComponent(shareId)}/play`))}>
                <PlayIcon/>Play
              </Button>
            </section>

            <div className="pfx-row">
              {(['leader', 'base'] as const).map(kind => {
                const cards = kind === 'leader' ? pool.leaders : pool.bases
                return (
                  <section key={kind} className="pfx-panel" aria-labelledby={`pfx-room-${kind}`}>
                    <h2 className="pfx-label" id={`pfx-room-${kind}`}>{kind === 'leader' ? 'Leaders' : 'Bases'} ({cards.length})</h2>
                    <div className="pfx-cards">
                      {cards.map((card, i) => (
                        <PackCardTile
                          key={`${kind}-${i}`}
                          card={card}
                          kind={kind}
                          onMouseEnter={e => preview.handleCardMouseEnter(card, e)}
                          onMouseLeave={preview.handleCardMouseLeave}
                          onTouchStart={() => preview.handleCardTouchStart(card)}
                          onTouchEnd={preview.handleCardTouchEnd}
                        />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>

            <section className="pfx-panel" aria-labelledby="pfx-room-deck">
              <h2 className="pfx-label" id="pfx-room-deck">Your Deck ({hidden} Hidden Cards)</h2>
              <p className="pfx-muted">These stay face down. You meet them as you draw them.</p>
              <div className="pfx-backs">
                {Array.from({ length: hidden }, (_, i) => <img key={i} src="/card-images/card-back.png" alt="Hidden card"/>)}
              </div>
            </section>
          </>
        )}
      </div>
      {preview.hoveredCardPreview && (
        <CardPreview
          card={preview.hoveredCardPreview.card as PreviewCard}
          x={preview.hoveredCardPreview.x}
          y={preview.hoveredCardPreview.y}
          isMobile={preview.hoveredCardPreview.isMobile}
          onMouseEnter={preview.handlePreviewMouseEnter}
          onMouseLeave={preview.handlePreviewMouseLeave}
          onDismiss={preview.dismissPreview}
        />
      )}
    </EntryShell>
  )
}
