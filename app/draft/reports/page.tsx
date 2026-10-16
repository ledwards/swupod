import DraftReports from '../../../src/components/DraftReports/DraftReports'
import DraftReportsLegacy from './DraftReportsLegacy'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'

/** Alpha testers get the themed Draft Reports page; everyone else keeps the current one. */
export default async function DraftReportsPage() {
  return (await viewerHasAlphaAccess()) ? <DraftReports/> : <DraftReportsLegacy/>
}
