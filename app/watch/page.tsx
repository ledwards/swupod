import {redirect} from 'next/navigation'
import PlayHomepage from '../../src/components/PlayHomepage'
import {viewerHasAlphaAccess} from '../../lib/viewerAccess'

/** Alpha testers get the homepage bundle's Watch view; everyone else finds live games on the current lobby. */
export default async function Watch(){
 if(!(await viewerHasAlphaAccess()))redirect('/lobby')
 return <PlayHomepage path="/watch"/>
}
