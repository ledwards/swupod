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
  onCreateBuild?: () => void
}

const VISIBLE_LIMIT = 6

function stripFormat(nickname: string): string {
  return nickname.replace(/\s*\(Limited\)\s*$/i, '').replace(/\s*\(Premiere\)\s*$/i, '').trim()
}

// Archetype nicknames follow "Leader Color" or "Leader Splash Color" convention
// where Color = the BASE's aspect (e.g. "Mothma Blue", "Sebulba Splash Yellow").
// Split into leader portion (colored by leader aspects) and base portion
// (colored by base aspects).
function splitArchetypeName(label: string): { leader: string; base: string } {
  const splashMatch = label.match(/^(.+?)\s+(Splash\s+\S+)$/i)
  if (splashMatch) return { leader: splashMatch[1], base: splashMatch[2] }
  const lastSpace = label.lastIndexOf(' ')
  if (lastSpace < 0) return { leader: label, base: '' }
  return { leader: label.slice(0, lastSpace), base: label.slice(lastSpace + 1) }
}

function BuildCard({ build, rootShareId, isActive }: { build: Build; rootShareId: string; isActive: boolean }) {
  const builder = build.isOriginal ? 'Original' : (build.builderName || 'Anonymous')
  const hasLeaderAspects = (build.leaderAspects?.length ?? 0) > 0
  const hasBaseAspects = (build.baseAspects?.length ?? 0) > 0
  const leaderStyle = hasLeaderAspects ? { color: getAspectColor({ aspects: build.leaderAspects }) } : undefined
  const baseStyle = hasBaseAspects ? { color: getAspectColor({ aspects: build.baseAspects }) } : undefined
  const rawLabel = build.archetypeNickname
    ? stripFormat(build.archetypeNickname)
    : (build.leaderName || 'No leader')
  const { leader, base } = splitArchetypeName(rawLabel)
  const href = build.isOriginal
    ? `/pool/${rootShareId}/deck`
    : `/pool/${rootShareId}/deck/${build.shareId}`

  return (
    <a href={href} className={`pool-build-card ${isActive ? 'pool-build-card-active' : ''}`}>
      <span className="pool-build-leader">
        <span style={leaderStyle}>{leader}</span>
        {base && <> <span style={baseStyle}>{base}</span></>}
      </span>
      <span className="pool-build-meta">
        by {builder}
      </span>
    </a>
  )
}

export default function PoolBuilds({ shareId, currentUserId, isOwner = false, activeShareId = null, onCreateBuild }: PoolBuildsProps) {
  const [builds, setBuilds] = useState<Build[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!shareId) return
    let cancelled = false
    const refetch = () => {
      fetch(`/api/pools/${shareId}/builds`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (!cancelled && data?.data?.builds) setBuilds(data.data.builds) })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    refetch()
    // Re-fetch when any deck state in this pool tree is saved.
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ rootShareId?: string }>).detail
      if (!detail?.rootShareId || detail.rootShareId === shareId) refetch()
    }
    window.addEventListener('wf:builds-changed', onChanged)
    return () => {
      cancelled = true
      window.removeEventListener('wf:builds-changed', onChanged)
    }
  }, [shareId])

  if (loading) return null
  if (!builds.length) return null

  const visible = builds.slice(0, VISIBLE_LIMIT)
  const overflow = builds.slice(VISIBLE_LIMIT)

  return (
    <div className="pool-builds">
      <p className="pool-builds-label">Decks with this Pool:</p>
      <div className="pool-builds-list">
        {visible.map(b => <BuildCard key={b.shareId} build={b} rootShareId={shareId} isActive={b.shareId === activeShareId} />)}
        {overflow.length > 0 && (
          <button className="pool-build-card pool-build-more" onClick={() => setModalOpen(true)}>
            <span className="pool-build-leader">+{overflow.length} more</span>
            <span className="pool-build-meta">View all {builds.length}</span>
          </button>
        )}
        {onCreateBuild && (
          <button
            type="button"
            className="pool-build-card pool-build-add"
            onClick={onCreateBuild}
            title="Create your build from this pool"
            aria-label="Create your build from this pool"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>

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
