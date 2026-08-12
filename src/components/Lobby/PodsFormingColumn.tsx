'use client'

import { useRouter } from 'next/navigation'
import Button from '@/src/components/Button'
import { getPackArtUrl } from '@/src/utils/packArt'
import { shortenLobbyName } from '@/src/utils/lobbyNameDisplay'
import { timeAgoShort } from './OpenGamesColumn'

interface PublicPod {
  shareId: string
  podType: string
  setCode: string
  setName: string
  name?: string | null
  maxPlayers: number
  currentPlayers: number
  host: { username: string; avatarUrl: string }
  createdAt: string
}

/** Pods Forming box (R15): the existing public pods, v3 seat-dot rows. */
export default function PodsFormingColumn({ pods }: { pods: PublicPod[] }): React.JSX.Element {
  const router = useRouter()

  return (
    <section className="lobby-column" aria-label="Draft pods open">
      <h3 className="lobby-column-title">
        Draft Pods Open ({pods.length})
      </h3>

      {/* The rows scroll inside the column so a busy board never grows
          the page past the fold — see the no-fold budget in Lobby.css. */}
      <div className="lobby-column-body">

        {pods.length === 0 && (
          <div className="lobby-state">
            <p>No pods forming right now.</p>
            <Button variant="primary" size="sm" onClick={() => router.push('/draft')}>
              Start a Pod
            </Button>
                    </div>
        )}

        {pods.map(pod => {
          const label = pod.name || `${pod.setCode} ${pod.podType === 'sealed' ? 'Sealed' : 'Draft'} Pod`
          const joinPath = pod.podType === 'sealed' ? `/sealed/${pod.shareId}` : `/draft/${pod.shareId}`
          // Set key art background, same as /draft's public pod rows.
          const artUrl = getPackArtUrl(pod.setCode)
          return (
            <div
              className={`lobby-row lobby-row--pod${artUrl ? ' lobby-row--art' : ''}`}
              key={pod.shareId}
              style={artUrl ? ({ ['--row-art' as never]: `url(${artUrl})` }) : undefined}
            >
              {/* One line of text, then the seats. This column is the narrow
                  one, so name + host + seats + Join side by side truncated the
                  name to "Ash" and the host to "ho...". */}
              <div className="lobby-pod-line" title={label}>
                <strong>{shortenLobbyName(label)}</strong>
                <span className="lobby-pod-meta">
                  {pod.host?.username || 'unknown'}
                  {' · '}{pod.currentPlayers}/{pod.maxPlayers}
                  {' · '}{timeAgoShort(pod.createdAt)}
                </span>
              </div>
              <div className="lobby-pod-foot">
                <div className="lobby-seats" aria-label={`${pod.currentPlayers} of ${pod.maxPlayers} seats filled`}>
                  {Array.from({ length: Math.min(pod.maxPlayers, 8) }, (_, i) => (
                    <span key={i} className={`lobby-seat${i < pod.currentPlayers ? ' lobby-seat-filled' : ''}`} />
                  ))}
                </div>
                <Button variant="primary" size="sm" onClick={() => router.push(joinPath)}>
                  Join
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
