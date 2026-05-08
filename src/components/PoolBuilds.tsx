// @ts-nocheck
import { useState, useEffect } from 'react'
import './PoolBuilds.css'

interface Build {
  shareId: string
  builderName: string | null
  isOriginal: boolean
  activeLeader: string | null
  activeBase: string | null
}

interface PoolBuildsProps {
  shareId: string
  currentUserId?: string | null
  isOwner?: boolean
}

export default function PoolBuilds({ shareId, currentUserId, isOwner = false }: PoolBuildsProps) {
  const [builds, setBuilds] = useState<Build[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!shareId) return
    fetch(`/api/pools/${shareId}/builds`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.builds) setBuilds(data.builds)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [shareId])

  if (loading) return null

  const childBuilds = builds.filter(b => !b.isOriginal)
  const hasOtherBuilds = childBuilds.length > 0

  if (!hasOtherBuilds && !isOwner) return null

  return (
    <div className="pool-builds">
      <h2 className="pool-builds-title">Builds</h2>
      {!hasOtherBuilds && isOwner ? (
        <p className="pool-builds-empty">No other builds yet — share this pool to let others build from it.</p>
      ) : (
        <div className="pool-builds-grid">
          {builds.map(build => (
            <a
              key={build.shareId}
              href={`/pool/${build.shareId}/deck`}
              className="pool-build-card"
            >
              <div className="pool-build-card-header">
                <span className="pool-build-builder">
                  {build.isOriginal ? 'Original Build' : (build.builderName || 'Anonymous')}
                </span>
                {build.isOriginal && (
                  <span className="pool-build-badge">Original</span>
                )}
              </div>
              <div className="pool-build-detail">
                <span className="pool-build-label">Leader:</span>
                <span>{build.activeLeader || 'Not selected'}</span>
              </div>
              <div className="pool-build-detail">
                <span className="pool-build-label">Base:</span>
                <span>{build.activeBase || 'Not selected'}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
