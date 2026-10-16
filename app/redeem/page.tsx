import RedeemAlpha from './RedeemAlpha'
import RedeemLegacy from './RedeemLegacy'
import { viewerHasAlphaAccess } from '../../lib/viewerAccess'

/** Alpha viewers get the themed Redeem page; everyone else keeps the current one. */
export default async function RedeemPage() {
  return (await viewerHasAlphaAccess()) ? <RedeemAlpha /> : <RedeemLegacy />
}
