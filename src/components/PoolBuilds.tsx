// @ts-nocheck
import { useState, useEffect } from 'react'
import Modal from './Modal'
import './PoolBuilds.css'

interface Build {
  shareId: string
  builderName: string | null
  isOriginal: boolean
  leaderName: string | null
  baseName: string | null
  deckCardCount: number
}

interface PoolBuildsProps {
  shareId: string  // root pool shareId
  currentUserId?: string | null
  isOwner?: boolean
}

const VISIBLE_LIMIT = 5

function BuildCard({ build, rootShareId }: { build: Build; rootShareId: string }) {
  const leader = build.leaderName || 'No leader'
  const base = build.baseName || 'No base'
  const builder = build.isOriginal ? 'Original' : (build.builderName || 'Anonymous')
  const count = build.deckCardCount
  const href = build.isOriginal
    ? `/pool/${rootShareId}/deck`
    : `/pool/${rootShareId}/deck/${build.shareId}`

  return (
    <a href={href} className="pool-build-card">
      <span className="pool-build-deck">
        {leader}, {base}
      </span>
      <span className="pool-build-meta">
        by {builder}{count > 0 ? ` (${count} cards)` : ''}
      </span>
    </a>
  )
}

export default function PoolBuilds({ shareId, currentUserId, isOwner = false }: PoolBuildsProps) {
  const [builds, setBuilds] = useState<Build[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!shareId) return
    fetch(`/api/pools/${shareId}/builds`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.data?.builds) setBuilds(data.data.builds) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [shareId])

  if (loading) return null

  const childBuilds = builds.filter(b => !b.isOriginal)
  if (!childBuilds.length && !isOwner) return null

  const visible = builds.slice(0, VISIBLE_LIMIT)
  const overflow = builds.slice(VISIBLE_LIMIT)

  return (
    <div className="pool-builds">
      <h2 className="pool-builds-title">Builds</h2>
      {!childBuilds.length && isOwner ? (
        <p className="pool-builds-empty">No other builds yet — share this pool to let others build from it.</p>
      ) : (
        <div className="pool-builds-list">
          {visible.map(b => <BuildCard key={b.shareId} build={b} rootShareId={shareId} />)}
          {overflow.length > 0 && (
            <button className="pool-build-card pool-build-more" onClick={() => setModalOpen(true)}>
              <span className="pool-build-deck">+{overflow.length} more</span>
              <span className="pool-build-meta">View all {builds.length} builds</span>
            </button>
          )}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="All Builds" showCloseButton>
        <Modal.Body>
          <div className="pool-builds-modal-grid">
            {builds.map(b => <BuildCard key={b.shareId} build={b} rootShareId={shareId} />)}
          </div>
        </Modal.Body>
      </Modal>
    </div>
  )
}
