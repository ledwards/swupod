import { viewerHasAlphaAccess } from '../../lib/viewerAccess'
import ShowcaseCollection from '../../src/components/Showcases/ShowcaseCollection'
import ShowcasesLegacy from './ShowcasesLegacy'

/** Alpha testers get the themed Showcase Collection; everyone else keeps the current one. */
export default async function ShowcasesPage() {
  return (await viewerHasAlphaAccess()) ? <ShowcaseCollection /> : <ShowcasesLegacy />
}
