import DraftLanding from './DraftLanding'
import DraftLandingLegacy from './DraftLandingLegacy'
import { viewerHasAlphaAccess } from '../../lib/viewerAccess'

/** Alpha testers get the redesigned Draft page; everyone else keeps the current one. */
export default async function DraftPage() {
  return (await viewerHasAlphaAccess()) ? <DraftLanding/> : <DraftLandingLegacy/>
}
