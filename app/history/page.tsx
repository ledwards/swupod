import PlayHomepage from '../../src/components/PlayHomepage'
import {viewerHasAlphaAccess} from '../../lib/viewerAccess'
import HistoryPage from './HistoryPage'

/** Alpha testers get the homepage bundle's History view here; everyone else keeps the current history page. */
export default async function History(){
 if(await viewerHasAlphaAccess())return <PlayHomepage path="/history"/>
 return <HistoryPage/>
}
