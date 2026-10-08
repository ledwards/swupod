import ReplayView from './ReplayView'
import '../../../play.css'

interface ReplayPageProps {
  params: Promise<{ matchId: string }>
}

export default async function ReplayPage({ params }: ReplayPageProps) {
  const { matchId } = await params
  return <ReplayView matchId={matchId} />
}
