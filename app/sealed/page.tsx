import SealedLanding from './SealedLanding'
import SealedLandingLegacy from './SealedLandingLegacy'
import { viewerHasAlphaAccess } from '../../lib/viewerAccess'

/** Alpha testers get the redesigned Sealed page; everyone else keeps the current one. */
export default async function SealedPage() {
  return (await viewerHasAlphaAccess()) ? <SealedLanding/> : <SealedLandingLegacy/>
}
