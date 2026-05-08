// @ts-nocheck
import { useState, useEffect } from 'react'
import Modal from './Modal'
import { ASPECT_COLORS, NO_ASPECT_COLOR } from '../utils/aspectColors'
import './PoolBuilds.css'

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning'] as const

function gradientForAspects(aspects?: string[]): string {
  const list = aspects || []
  const colors: string[] = []
  for (const a of list) {
    if ((COLOR_ASPECTS as readonly string[]).includes(a)) {
      colors.push((ASPECT_COLORS as Record<string, string>)[a] || NO_ASPECT_COLOR)
    }
  }
  // Append alignment as a color stop too — Heroism = white, Villainy = dark
  if (list.includes('Heroism')) colors.push((ASPECT_COLORS as Record<string, string>).Heroism)
  if (list.includes('Villainy')) colors.push((ASPECT_COLORS as Record<string, string>).Villainy)
  if (colors.length === 0) return NO_ASPECT_COLOR
  if (colors.length === 1) return colors[0]
  return `linear-gradient(90deg, ${colors.join(', ')})`
}

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

function BuildCard({ build, rootShareId, isActive }: { build: Build; rootShareId: string; isActive: boolean }) {
  const builder = build.isOriginal ? 'Original' : (build.builderName || 'Anonymous')
  const gradient = gradientForAspects(build.leaderAspects)
  const isGradient = gradient.startsWith('linear-gradient')
  const leaderStyle = isGradient
    ? { background: gradient } as React.CSSProperties
    : { background: gradient } as React.CSSProperties
  const label = build.archetypeNickname
    ? stripFormat(build.archetypeNickname)
    : (build.leaderName || 'No leader')
  const href = build.isOriginal
    ? `/pool/${rootShareId}/deck`
    : `/pool/${rootShareId}/deck/${build.shareId}`

  return (
    <a href={href} className={`pool-build-card ${isActive ? 'pool-build-card-active' : ''}`}>
      <span className="pool-build-leader" style={leaderStyle}>
        {label}
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
    fetch(`/api/pools/${shareId}/builds`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.data?.builds) setBuilds(data.data.builds) })
      .catch(() => {})
      .finally(() => setLoading(false))
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
