'use client'

import { useRouter } from 'next/navigation'
import Button from '@/src/components/Button'
import { getPackArtUrl } from '@/src/utils/packArt'
import { timeAgo } from './OpenGamesColumn'

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
    <section className="lobby-column" aria-label="Pods forming">
      <h3 className="lobby-column-title">
        Pods Forming ({pods.length})<span>live drafts &amp; sealed</span>
      </h3>

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
            className={`lobby-row${artUrl ? ' lobby-row--art' : ''}`}
            key={pod.shareId}
            style={artUrl ? ({ ['--row-art' as never]: `url(${artUrl})` }) : undefined}
          >
            <div className="lobby-row-who">
              <div className="lobby-row-name">{label}</div>
              <div className="lobby-row-meta">
                host: {pod.host?.username || 'unknown'} · {pod.currentPlayers}/{pod.maxPlayers} ·{' '}
                {timeAgo(pod.createdAt)}
              </div>
            </div>
            <div className="lobby-seats" aria-label={`${pod.currentPlayers} of ${pod.maxPlayers} seats filled`}>
              {Array.from({ length: Math.min(pod.maxPlayers, 8) }, (_, i) => (
                <span key={i} className={`lobby-seat${i < pod.currentPlayers ? ' lobby-seat-filled' : ''}`} />
              ))}
            </div>
            <Button variant="primary" size="sm" onClick={() => router.push(joinPath)}>
              Join
            </Button>
          </div>
        )
      })}
    </section>
  )
}
