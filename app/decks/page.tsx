import {redirect} from 'next/navigation'
import PlayHomepage from '../../src/components/PlayHomepage'
import {viewerHasAlphaAccess} from '../../lib/viewerAccess'

/** Alpha testers get the homepage bundle's Decks and Pools view; everyone else's decks and pools live on /history. */
export default async function Decks(){
 if(!(await viewerHasAlphaAccess()))redirect('/history')
 return <PlayHomepage path="/decks"/>
}
