import { redirect } from 'next/navigation'
import ReportIndexLegacy from './ReportIndexLegacy'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'

/** On alpha the Draft Report lives in the Draft Log (and its Draft Review page); everyone else keeps the report pages. */
export default async function DraftReportIndexPage({ params }: { params: Promise<{ shareId: string }> }) {
  if (await viewerHasAlphaAccess()) redirect(`/draft/${encodeURIComponent((await params).shareId)}/log`)
  return <ReportIndexLegacy params={params}/>
}
