import { notFound } from 'next/navigation'
import DraftReview from '../../../../src/components/DraftLog/DraftReview'
import { draftPodHost, hostIsFriendOfThePod } from '../../../../lib/draftReview'

/**
 * The draft review: a finished draft's slideshow as its own page. It exists only
 * when the pod's host is a Friend of the Pod; who can see which seats follows the
 * pod's public/private setting (the slideshow API applies it).
 */
export default async function DraftReviewPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  const pod = await draftPodHost(shareId)
  if (!pod || !(await hostIsFriendOfThePod(pod.hostId))) notFound()
  return <DraftReview shareId={shareId}/>
}
