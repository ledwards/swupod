import MeleeConnection from '@/src/components/MeleeConnection'
import MeleeConnectionAlpha from '@/src/components/MeleeConnectionAlpha'
import {viewerHasAlphaAccess} from '@/lib/viewerAccess'
export const metadata={title:'Connect Melee — Protect the Pod',robots:{index:false,follow:false}}
/** Alpha viewers get the themed page; everyone else keeps the current one. */
export default async function Page(){return (await viewerHasAlphaAccess())?<MeleeConnectionAlpha/>:<MeleeConnection/>}
