import PlayHomepage from '../src/components/PlayHomepage'
import LegacyHome from './LegacyHome'
import { viewerHasAlphaAccess } from '../lib/viewerAccess'

/** Alpha testers get the play homepage; everyone else keeps the current front page. */
export default async function Home() {
  return (await viewerHasAlphaAccess()) ? <PlayHomepage/> : <LegacyHome/>
}
