import PoolsNew from '../../../src/components/PoolsNew/PoolsNew'
import PoolsNewLegacy from './PoolsNewLegacy'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'

/** Alpha testers open packs into the themed pool page; everyone else keeps the current page. */
export default async function NewPoolPage() {
  return (await viewerHasAlphaAccess()) ? <PoolsNew/> : <PoolsNewLegacy/>
}
