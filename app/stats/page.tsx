import {viewerHasAlphaAccess} from '../../lib/viewerAccess'
import MetaPage from '../../src/components/Meta/MetaPage'
import LegacyStatsPage from './LegacyStatsPage'

/** Alpha testers get the themed Meta page; everyone else keeps the current stats page. */
export default async function Stats(){
 if(await viewerHasAlphaAccess())return <MetaPage/>
 return <LegacyStatsPage/>
}
