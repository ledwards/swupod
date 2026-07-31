import OpenGameMatch from '@/src/components/OpenGameMatch'
import '@/src/components/LandingPage.css'

/**
 * /g/[shareId] — the open-game page: private-link invite view for visitors,
 * waiting/match view for the two seats (Lobby V1, U5).
 *
 * Wrapped in the homepage's `.landing-page` shell (same pairing /lobby uses)
 * so the match page sits on the site's textured background instead of flat
 * black — every state of this page, invite view included.
 */
export default async function OpenGamePage({
  params,
}: {
  params: Promise<{ shareId: string }>
}): Promise<React.JSX.Element> {
  const { shareId } = await params
  return (
    <div className="landing-page lobby-shell">
      <OpenGameMatch shareId={shareId} />
    </div>
  )
}
