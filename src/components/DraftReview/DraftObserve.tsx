'use client'
import { SiteTitle } from '../SiteTheme'
import ContentSkeleton from '../ContentSkeleton'
import TimerPanel from '../TimerPanel'
import ReviewSeatTabs from './ReviewSeatTabs'
import ReviewStage from './ReviewStage'
import ReviewNav from './ReviewNav'
import { useReviewSlideshow } from './useReviewSlideshow'
import '../PodHub/pod-hub.css'
import '../DraftLog/draft-log.css'
import './draft-review.css'

/**
 * The live observer (alpha): a public, no-login view of a draft in progress for
 * streaming. It follows the latest pick, shows the pick timer, and lets the
 * viewer scrub back. If the host hasn't enabled the link, the feed says so.
 */
export default function DraftObserve({ shareId }: { shareId: string }) {
  const s = useReviewSlideshow(shareId, { live: true, followTail: true })
  const draft = s.data?.draft
  const name = draft ? draft.name || `${draft.setName || draft.setCode} Draft` : 'Live Draft'
  const subtitle = ['Live Observer', draft?.setName, s.seats.length ? `${s.seats.length} players` : null].filter(Boolean).join(' · ')
  const title = <SiteTitle subtitle={subtitle}>{name}</SiteTitle>

  if (s.loadState === 'loading' && !s.data) return (
    <section className="pod-hub drv" aria-label="Live draft" aria-busy="true">
      {title}
      <div className="drv-pending"><ContentSkeleton kind="control" count={8}/><ContentSkeleton kind="row" count={4}/></div>
    </section>
  )
  if (s.loadState === 'error' || !s.data) return (
    <section className="pod-hub pod-hub--empty drv" aria-label="Live draft">
      {title}
      <p role="alert">{s.error || 'This live draft couldn’t be loaded.'}</p>
    </section>
  )

  return (
    <section className="pod-hub drv" aria-label="Live draft">
      {title}
      <div className="drv-live-bar">
        <div className="drv-live">
          <span className="drv-live-tag">Live</span>
          <b>{s.label}</b>
          {s.atTail && <span className="pod-hint">Following the latest pick</span>}
        </div>
        {s.timer && (
          <div className="drv-timer">
            <TimerPanel draft={s.timer} draftState={s.timer.draftState} compact isHost={false}/>
          </div>
        )}
      </div>
      <ReviewSeatTabs seats={s.seats} selected={s.selected} allSelected={s.allSelected} viewerSeat={s.data.viewerSeat}
        onToggleSeat={s.onToggleSeat} onToggleAll={s.onToggleAll}/>
      <section className="dlog-pick drv-panel" aria-label="Packs on offer">
        <h2 className="dlog-pick-label">Packs on Offer</h2>
        <ReviewStage seats={s.selectedSeats} slideIndex={s.slideIndex} viewerSeat={s.data.viewerSeat} compact/>
      </section>
      <ReviewNav slideIndex={s.slideIndex} slideCount={s.slideCount} label={s.label} onPrev={s.onPrev} onNext={s.onNext}/>
    </section>
  )
}
