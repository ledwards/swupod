import { redirect } from 'next/navigation'
import ReportLegacy from './ReportLegacy'
import { viewerHasAlphaAccess } from '../../../../../lib/viewerAccess'

/** On alpha the Draft Report lives in the Draft Log (and its Draft Review page); everyone else keeps the report pages. */
export default async function DraftReportPage({ params }: { params: Promise<{ shareId: string; poolShareId: string }> }) {
  if (await viewerHasAlphaAccess()) redirect(`/draft/${encodeURIComponent((await params).shareId)}/log`)
  return <ReportLegacy params={params}/>
}
