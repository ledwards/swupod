import GiftGc2026Alpha from './GiftGc2026Alpha'
import GiftGc2026Legacy from './GiftGc2026Legacy'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'

/** Alpha viewers get the themed GC 2026 gift page; everyone else keeps the current one. */
export default async function GiftGc2026Page() {
  return (await viewerHasAlphaAccess()) ? <GiftGc2026Alpha /> : <GiftGc2026Legacy />
}
