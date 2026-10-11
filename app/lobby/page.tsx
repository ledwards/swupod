import { redirect } from 'next/navigation'
import LobbyHome from '../../src/components/Lobby/LobbyHome'
import { viewerHasAlphaAccess } from '../../lib/viewerAccess'

/**
 * Alpha testers' home is the play homepage at /, so old /lobby links, bookmarks and
 * login returns go there, query intact (?invite, ?pool). Everyone else keeps the current lobby.
 */
export default async function LobbyPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  if (await viewerHasAlphaAccess()) {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(await searchParams)) for (const v of [value ?? []].flat()) query.append(key, v)
    redirect(query.size ? `/?${query}` : '/')
  }
  return <LobbyHome/>
}
