import DraftObserve from '../../../../src/components/DraftReview/DraftObserve'
import ObserveLegacy from './ObserveLegacy'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'

/** Alpha testers get the themed live observer page; everyone else keeps the full-screen slideshow. */
export default async function PrivilegedObserverPage({ params }: { params: Promise<{ shareId: string }> }) {
  if (await viewerHasAlphaAccess()) return <DraftObserve shareId={(await params).shareId}/>
  return <ObserveLegacy params={params}/>
}
