// @ts-nocheck
import { useState, useEffect } from 'react'
import Modal from './Modal'
import { getAspectColor } from '../utils/aspectColors'
import './PoolBuilds.css'

interface Build {
  shareId: string
  builderName: string | null
  isOriginal: boolean
  leaderName: string | null
  leaderAspects?: string[]
  baseName: string | null
  baseAspects?: string[]
  archetypeNickname?: string | null
  deckCardCount: number
}

interface PoolBuildsProps {
  shareId: string  // root pool shareId
  currentUserId?: string | null
  isOwner?: boolean
  activeShareId?: string | null  // shareId of the build currently being viewed
}

const VISIBLE_LIMIT = 6

function stripFormat(nickname: string): string {
  return nickname.replace(/\s*\(Limited\)\s*$/i, '').replace(/\s*\(Premiere\)\s*$/i, '').trim()
}

function BuildCard({ build, rootShareId, isActive }: { build: Build; rootShareId: string; isActive: boolean }) {
  const builder = build.isOriginal ? 'Original' : (build.builderName || 'Anonymous')
  const leaderColor = getAspectColor({ aspects: build.leaderAspects })
  const label = build.archetypeNickname
    ? stripFormat(build.archetypeNickname)
    : (build.leaderName || 'No leader')
  const href = build.isOriginal
    ? `/pool/${rootShareId}/deck`
    : `/pool/${rootShareId}/deck/${build.shareId}`

  return (
    <a href={href} className={`pool-build-card ${isActive ? 'pool-build-card-active' : ''}`}>
      <span className="pool-build-leader" style={{ color: leaderColor }}>
        {label}
      </span>
      <span className="pool-build-meta">
        by {builder}
      </span>
    </a>
  )
}

export default function PoolBuilds({ shareId, currentUserId, isOwner = false, activeShareId = null }: PoolBuildsProps) {
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
      <p className="pool-builds-label">Decks with this Pool:</p>
      {!childBuilds.length && isOwner ? (
        <p className="pool-builds-empty">No other builds yet — share this pool to let others build from it.</p>
      ) : (
        <div className="pool-builds-list">
          {visible.map(b => <BuildCard key={b.shareId} build={b} rootShareId={shareId} isActive={b.shareId === activeShareId} />)}
          {overflow.length > 0 && (
            <button className="pool-build-card pool-build-more" onClick={() => setModalOpen(true)}>
              <span className="pool-build-leader">+{overflow.length} more</span>
              <span className="pool-build-meta">View all {builds.length}</span>
            </button>
          )}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="All Builds" showCloseButton>
        <Modal.Body>
          <div className="pool-builds-modal-grid">
            {builds.map(b => <BuildCard key={b.shareId} build={b} rootShareId={shareId} isActive={b.shareId === activeShareId} />)}
          </div>
        </Modal.Body>
      </Modal>
    </div>
  )
}
