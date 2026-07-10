'use client'

import { useRouter } from 'next/navigation'
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

/**
 * Pods Forming column (R15): resurfaces the existing public pods using the
 * exact `.history-item` treatment from /draft and /sealed/pod.
 */
export default function PodsFormingColumn({ pods }: { pods: PublicPod[] }): React.JSX.Element {
  const router = useRouter()

  return (
    <div className="draft-history lobby-column">
      <h2>Pods Forming</h2>
      <div className="history-list">
        {pods.map(pod => {
          const artUrl = getPackArtUrl(pod.setCode)
          const joinPath = pod.podType === 'sealed' ? `/sealed/${pod.shareId}` : `/draft/${pod.shareId}`
          return (
            <div
              key={`lobby-pod-${pod.shareId}`}
              className={`history-item${artUrl ? ' history-item--art' : ''}`}
              style={artUrl ? { backgroundImage: `url("${artUrl}")` } : undefined}
              role="button"
              tabIndex={0}
              onClick={() => router.push(joinPath)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') router.push(joinPath)
              }}
            >
              <div className="history-item-main">
                <span className="history-set">{pod.name || pod.setName}</span>
                <span className="history-status waiting">Open</span>
              </div>
              <div className="history-item-meta">
                <span className="history-date">
                  {pod.host?.username || 'unknown'} · {pod.currentPlayers}/{pod.maxPlayers} players ·{' '}
                  {timeAgo(pod.createdAt)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
