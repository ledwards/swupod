import RuntimeStub from './RuntimeStub'
import '../../play.css'

interface RuntimePageProps {
  params: Promise<{ matchId: string }>
  searchParams: Promise<{ seatToken?: string | string[] }>
}

export default async function RuntimePage({ params, searchParams }: RuntimePageProps) {
  const { matchId } = await params
  const { seatToken } = await searchParams
  const token = Array.isArray(seatToken) ? seatToken[0] ?? '' : seatToken ?? ''

  return <RuntimeStub matchId={matchId} seatToken={token} />
}
