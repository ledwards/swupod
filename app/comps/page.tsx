import type { Metadata } from 'next'
import { viewerHasAlphaAccess } from '../../lib/viewerAccess'
import CompsBoard from '../../src/components/Comps/CompsBoard'
import CompsLegacy from './CompsLegacy'

export const metadata: Metadata = {
  title: 'How the simulators compare',
  robots: { index: false, follow: false },
}

/** Alpha testers get the themed comparison; everyone else keeps the current one. */
export default async function CompsPage() {
  return (await viewerHasAlphaAccess()) ? <CompsBoard /> : <CompsLegacy />
}
