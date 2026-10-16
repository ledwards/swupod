import QAReportPage from '../../src/components/QAReport/QAReportPage'
import QALegacy from './QALegacy'
import { viewerHasAlphaAccess } from '../../lib/viewerAccess'

/** Alpha testers get the themed QA report; everyone else keeps the current page. /qa stays public. */
export default async function QAPage() {
  return (await viewerHasAlphaAccess()) ? <QAReportPage /> : <QALegacy />
}
