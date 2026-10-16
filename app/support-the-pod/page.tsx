import { viewerHasAlphaAccess } from '../../lib/viewerAccess'
import SupportThePod from '../../src/components/SupportThePod/SupportThePod'
import SupportThePodLegacy from './SupportThePodLegacy'

/** Alpha testers get the themed Support page; everyone else keeps the current one. */
export default async function SupportThePodPage() {
  return (await viewerHasAlphaAccess()) ? <SupportThePod /> : <SupportThePodLegacy />
}
