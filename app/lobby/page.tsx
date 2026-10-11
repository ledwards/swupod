import { redirect } from 'next/navigation'
import LobbyHome from '../../src/components/Lobby/LobbyHome'
import { viewerHasAlphaAccess } from '../../lib/viewerAccess'

/**
 * Alpha testers have no /lobby: the homepage is the lobby and Play lives at /play. Old /lobby
 * links, bookmarks and login returns go home, or to Play when they carry a deck, invite or format,
 * query intact. Everyone else keeps the current lobby.
 */
export default async function LobbyPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  if (await viewerHasAlphaAccess()) {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(await searchParams)) for (const v of [value ?? []].flat()) query.append(key, v)
    redirect(query.has('pool') || query.has('invite') || query.has('format') ? `/play?${query}` : query.size ? `/?${query}` : '/')
  }
  return <LobbyHome/>
}
