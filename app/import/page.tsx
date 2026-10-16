import ImportPage from '../../src/components/ImportPoolAlpha/ImportPage'
import ImportLegacy from './ImportLegacy'
import { viewerHasAlphaAccess } from '../../lib/viewerAccess'

/** Alpha testers get the themed Import Pool page; everyone else keeps the current one. */
export default async function ImportPoolPage() {
  return (await viewerHasAlphaAccess()) ? <ImportPage/> : <ImportLegacy/>
}
