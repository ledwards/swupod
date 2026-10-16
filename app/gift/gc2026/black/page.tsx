import GiftGc2026BlackAlpha from './GiftGc2026BlackAlpha'
import GiftGc2026BlackLegacy from './GiftGc2026BlackLegacy'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'

/** Alpha viewers get the themed Black Pack page; everyone else keeps the current one. */
export default async function GiftGc2026BlackPage() {
  return (await viewerHasAlphaAccess()) ? <GiftGc2026BlackAlpha /> : <GiftGc2026BlackLegacy />
}
