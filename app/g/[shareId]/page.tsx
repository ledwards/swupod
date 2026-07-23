import OpenGameMatch from '@/src/components/OpenGameMatch'

/**
 * /g/[shareId] — the open-game page: private-link invite view for visitors,
 * waiting/match view for the two seats (Lobby V1, U5).
 */
export default async function OpenGamePage({
  params,
}: {
  params: Promise<{ shareId: string }>
}): Promise<React.JSX.Element> {
  const { shareId } = await params
  return <OpenGameMatch shareId={shareId} />
}
