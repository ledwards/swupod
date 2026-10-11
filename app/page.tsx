import { redirect } from 'next/navigation'
import PlayHomepage from '../src/components/PlayHomepage'
import LegacyHome from './LegacyHome'
import { viewerHasAlphaAccess } from '../lib/viewerAccess'
import { playSetupPath } from '../lib/playSetup'

/** Alpha testers get the play homepage; everyone else keeps the current front page. */
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  if (!(await viewerHasAlphaAccess())) return <LegacyHome/>
  // Deck and invite links open Play at its own address, so the header shows Play, not the homepage.
  const query = await searchParams
  if (query.pool || query.invite) redirect(playSetupPath(query))
  return <PlayHomepage/>
}
