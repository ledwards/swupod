import { viewerHasAlphaAccess } from '../../lib/viewerAccess'
import BetaProgram from '../../src/components/Beta/BetaProgram'
import BetaLegacy from './BetaLegacy'

/** Alpha testers get the themed Beta page; everyone else keeps the current one. */
export default async function BetaPage() {
  return (await viewerHasAlphaAccess()) ? <BetaProgram /> : <BetaLegacy />
}
