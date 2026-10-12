import { Suspense } from 'react'
import DraftLogLegacy from './DraftLogLegacy'
import DraftLog from '../../../../src/components/DraftLog/DraftLog'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'

/** Alpha testers get the redesigned Draft Log (with Pod Review for Friends of the Pod); everyone else keeps the current one. */
export default async function DraftLogPage({ params }: { params: Promise<{ shareId: string }> }) {
  if (await viewerHasAlphaAccess()) return <Suspense><DraftLog shareId={(await params).shareId}/></Suspense>
  return <DraftLogLegacy params={params}/>
}
