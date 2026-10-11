import PodLegacy from './PodLegacy'
import PodHub from '../../../../src/components/PodHub/PodHub'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'

/** Alpha testers get the pod page with the online tournament; everyone else keeps the current one. */
export default async function PodPage({ params }: { params: Promise<{ shareId: string }> }) {
  if (await viewerHasAlphaAccess()) return <PodHub shareId={(await params).shareId}/>
  return <PodLegacy params={params}/>
}
