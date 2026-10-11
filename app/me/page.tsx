import PlayHomepage from '../../src/components/PlayHomepage'
import {viewerHasAlphaAccess} from '../../lib/viewerAccess'
import MePage from './MePage'

/** Alpha testers get the homepage bundle's My Stats view here; everyone else keeps the current personal stats page. */
export default async function Me(){
 if(await viewerHasAlphaAccess())return <PlayHomepage path="/me"/>
 return <MePage/>
}
