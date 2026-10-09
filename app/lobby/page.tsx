import PlayHomepage from '../../src/components/PlayHomepage'
import LobbyHome from '../../src/components/Lobby/LobbyHome'
import { viewerHasAlphaAccess } from '../../lib/viewerAccess'

/** Alpha testers get the play homepage lobby; everyone else keeps the current lobby. */
export default async function LobbyPage() {
  return (await viewerHasAlphaAccess()) ? <PlayHomepage/> : <LobbyHome/>
}
