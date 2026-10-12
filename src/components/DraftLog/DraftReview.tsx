'use client'
import DraftSlideshow from '../DraftSlideshow'
import '../../App.css'
import '../../styles/backgrounds.css'

/** The draft review page: the report slideshow, as a page rather than an overlay (no close). */
export default function DraftReview({ shareId }: { shareId: string }) {
  return <DraftSlideshow shareId={shareId} publicMode onClose={() => {}}/>
}
