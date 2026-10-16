'use client'
import { SiteTitle } from '../SiteTheme'
import ContentSkeleton from '../ContentSkeleton'
import ReviewSeatTabs from '../DraftReview/ReviewSeatTabs'
import ReviewStage from '../DraftReview/ReviewStage'
import ReviewNav from '../DraftReview/ReviewNav'
import { useReviewSlideshow } from '../DraftReview/useReviewSlideshow'
import '../PodHub/pod-hub.css'
import './draft-log.css'
import '../DraftReview/draft-review.css'

/**
 * The draft review page (alpha): a finished draft pick by pick. Choose the
 * players to compare; each shows the pack it saw with the card it took ringed.
 */
export default function DraftReview({ shareId }: { shareId: string }) {
  const s = useReviewSlideshow(shareId)
  const draft = s.data?.draft
  const title = <SiteTitle subtitle={draft ? [draft.name, draft.setName].filter(Boolean).join(' · ') : undefined}>Draft Review</SiteTitle>

  if (s.loadState === 'loading' && !s.data) return (
    <section className="pod-hub drv" aria-label="Draft review" aria-busy="true">
      {title}
      <div className="drv-pending"><ContentSkeleton kind="control" count={6}/><ContentSkeleton kind="card" count={8}/></div>
    </section>
  )
  if (s.loadState === 'error' || !s.data) return (
    <section className="pod-hub pod-hub--empty drv" aria-label="Draft review">
      {title}
      <p role="alert">This draft review couldn’t be loaded.</p>
      <a className="pod-sec" href={`/draft/${encodeURIComponent(shareId)}/log`}>Draft Log</a>
    </section>
  )

  return (
    <section className="pod-hub drv" aria-label="Draft review">
      {title}
      <div className="drv-bar">
        <ReviewSeatTabs seats={s.seats} selected={s.selected} allSelected={s.allSelected} viewerSeat={s.data.viewerSeat}
          onToggleSeat={s.onToggleSeat} onToggleAll={s.onToggleAll}/>
        <a className="pod-sec pod-sec--compact" href={`/draft/${encodeURIComponent(shareId)}/log`}>Draft Log</a>
      </div>
      <section className="dlog-pick drv-panel" aria-label={s.label || 'Pick'}>
        <h2 className="dlog-pick-label">{s.label.replace(' · ', ' ') || 'Pick'}</h2>
        <ReviewStage seats={s.selectedSeats} slideIndex={s.slideIndex} viewerSeat={s.data.viewerSeat}/>
      </section>
      <ReviewNav slideIndex={s.slideIndex} slideCount={s.slideCount} label={s.label} onPrev={s.onPrev} onNext={s.onNext}/>
    </section>
  )
}
