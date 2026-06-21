// @ts-nocheck
import { useState, useEffect } from 'react'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { getAspectColor } from '../utils/aspectColors'
import { archetypeShortName } from '../utils/archetypeName'
import { formatRecord } from '../utils/deckRecord'
import './PoolBuilds.css'
// Shared delete-confirm visual — red title, red filled button. Same rules
// the History page has used for a long time; importing the canonical file
// keeps every confirm modal in sync without re-stating the CSS per page.

interface Build {
  shareId: string
  builderName: string | null
  builderUserId?: string | null
  isOriginal: boolean
  leaderName: string | null
  leaderShortName?: string | null
  leaderAspects?: string[]
  baseName: string | null
  baseAspects?: string[]
  baseHp?: number | null
  archetypeNickname?: string | null
  deckCardCount: number
  wins: number
  losses: number
  draws: number
  createdAt?: string | null
}

// Group builds by author for the "All Builds" modal.
// Returns an array of { key, label, builds[] } in display order:
//   1) The original (parent) entry — labeled "Original (owner)"
//   2) Each unique builder, ordered by their most-recent build's createdAt desc
//   3) Anonymous (builderUserId == null) lumped at the end
function groupBuildsByAuthor(builds: Build[]): Array<{ key: string; label: string; builds: Build[] }> {
  const original = builds.find(b => b.isOriginal) || null
  const children = builds.filter(b => !b.isOriginal)

  const groupMap = new Map<string, { key: string; label: string; builds: Build[]; latest: string }>()
  for (const b of children) {
    const key = b.builderUserId || `anon:${b.builderName || 'Anonymous'}`
    const label = b.builderName || 'Anonymous'
    const existing = groupMap.get(key)
    const ts = b.createdAt || ''
    if (existing) {
      existing.builds.push(b)
      if (ts > existing.latest) existing.latest = ts
    } else {
      groupMap.set(key, { key, label, builds: [b], latest: ts })
    }
  }
  const groups = Array.from(groupMap.values())
  // Anonymous (no builderUserId) go last; otherwise sort by most-recent-build desc.
  groups.sort((a, b) => {
    const aAnon = a.key.startsWith('anon:')
    const bAnon = b.key.startsWith('anon:')
    if (aAnon !== bAnon) return aAnon ? 1 : -1
    if (a.latest === b.latest) return 0
    return a.latest < b.latest ? 1 : -1
  })

  const ordered: Array<{ key: string; label: string; builds: Build[] }> = []
  if (original) {
    const ownerLabel = original.builderName ? `Original (${original.builderName})` : 'Original'
    ordered.push({ key: 'original', label: ownerLabel, builds: [original] })
  }
  for (const g of groups) ordered.push({ key: g.key, label: g.label, builds: g.builds })
  return ordered
}

interface PoolBuildsProps {
  shareId: string  // root pool shareId
  currentUserId?: string | null
  isOwner?: boolean
  activeShareId?: string | null  // shareId of the build currently being viewed
  onCreateBuild?: () => void
  createBuildMessage?: string | null
  onCopyShare?: () => void
}

const VISIBLE_LIMIT = 6

function stripFormat(nickname: string): string {
  // Drop trailing "(Limited)" / "(Premiere)" format and any embedded "(SET)" tokens like "(LAW)"/"(SOR)"
  return nickname
    .replace(/\s*\((?:Limited|Premiere)\)\s*$/i, '')
    .replace(/\s*\([A-Z]{2,4}\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Archetype nicknames follow "Leader Color", "Leader Splash Color", or
// "Leader Color HP" convention where Color = the BASE's aspect
// (e.g. "Mothma Blue", "Sebulba Splash Yellow", "Cad Yellow 30").
// Split into leader portion (colored by leader aspects) and base portion
// (colored by base aspects). The base portion always includes the color word.
function splitArchetypeName(label: string): { leader: string; base: string } {
  const splashHpMatch = label.match(/^(.+?)\s+(Splash\s+\S+\s+\d+)$/i)
  if (splashHpMatch) return { leader: splashHpMatch[1], base: splashHpMatch[2] }
  const splashMatch = label.match(/^(.+?)\s+(Splash\s+\S+)$/i)
  if (splashMatch) return { leader: splashMatch[1], base: splashMatch[2] }
  const colorHpMatch = label.match(/^(.+?)\s+(\S+\s+\d+)$/)
  if (colorHpMatch) return { leader: colorHpMatch[1], base: colorHpMatch[2] }
  const lastSpace = label.lastIndexOf(' ')
  if (lastSpace < 0) return { leader: label, base: '' }
  return { leader: label.slice(0, lastSpace), base: label.slice(lastSpace + 1) }
}

function BuildCard({
  build,
  rootShareId,
  isActive,
  currentUserId,
  isOwner = false,
  onRequestDelete,
}: {
  build: Build
  rootShareId: string
  isActive: boolean
  currentUserId?: string | null
  isOwner?: boolean
  onRequestDelete?: (build: Build) => void
}) {
  const builder = build.isOriginal
    ? `${build.builderName || 'Anonymous'} (Original)`
    : (build.builderName || 'Anonymous')
  const hasLeaderAspects = (build.leaderAspects?.length ?? 0) > 0
  const hasBaseAspects = (build.baseAspects?.length ?? 0) > 0
  const leaderStyle = hasLeaderAspects ? { color: getAspectColor({ aspects: build.leaderAspects }) } : undefined
  const baseStyle = hasBaseAspects ? { color: getAspectColor({ aspects: build.baseAspects }) } : undefined
  // Resolved archetype nickname when present; otherwise a "Leader Color HP"
  // fallback built from the deck so it never collapses to a bare "Ahsoka".
  const rawLabel = archetypeShortName({
    archetypeNickname: build.archetypeNickname,
    leaderShortName: build.leaderShortName,
    leaderName: build.leaderName,
    baseAspects: build.baseAspects,
    baseHp: build.baseHp,
  }) || 'No leader'
  const { leader, base } = splitArchetypeName(rawLabel)
  const href = build.isOriginal
    ? `/pool/${rootShareId}/deck`
    : `/pool/${rootShareId}/deck/${build.shareId}`
  const ownsThis = Boolean(currentUserId && build.builderUserId && build.builderUserId === currentUserId)
  // Deletable if it's your deck (anywhere) OR it sits on your pool (you're the
  // pool owner). Not deletable: someone else's deck on someone else's pool.
  const canDelete = ownsThis || isOwner

  return (
    <div className="pool-build-entry">
      <a href={href} className={`pool-build-card ${isActive ? 'pool-build-card-active' : ''} ${canDelete && onRequestDelete ? 'pool-build-card--owned' : ''}`}>
        <span className="pool-build-leader">
          <span style={leaderStyle}>{leader}</span>
          {base && <> <span style={baseStyle}>{base}</span></>}
        </span>
        {canDelete && onRequestDelete && (
          <button
            type="button"
            className="pool-build-trash"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRequestDelete(build) }}
            title="Delete this deck"
            aria-label="Delete this deck"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        )}
      </a>
      {/* Deck record below the card rectangle, centered. */}
      <span className="pool-build-meta pool-build-meta--below">
        by {builder}
      </span>
      <span className="pool-build-meta pool-build-meta--record">
        {formatRecord(build)}
      </span>
    </div>
  )
}

export default function PoolBuilds({ shareId, currentUserId, isOwner = false, activeShareId = null, onCreateBuild, createBuildMessage = null, onCopyShare }: PoolBuildsProps) {
  const [builds, setBuilds] = useState<Build[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Build | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Authoritative pool ownership for delete gating: the ROOT pool's owner is the
  // builder of the original entry — NOT DeckBuilder's edit-`isOwner`, which on a
  // child-build page reflects ownership of that build, not the pool. This keeps
  // "delete any deck on my pool" from leaking to people who merely own one deck
  // on someone else's pool.
  const rootPoolOwnerId = builds.find((b) => b.isOriginal)?.builderUserId || null
  const iOwnPool = Boolean(currentUserId && rootPoolOwnerId && currentUserId === rootPoolOwnerId)

  // For an isOriginal target, find the next-best build owned by the same user
  // to promote to root. We pick the oldest sibling by createdAt — the user's
  // first non-original deck. Returns null if they have no other owned builds.
  const findReparentTarget = (target: Build): Build | null => {
    if (!target.isOriginal || !currentUserId) return null
    return builds
      .filter(b => !b.isOriginal && b.builderUserId === currentUserId)
      .sort((a, b) => (a.createdAt || '') < (b.createdAt || '') ? -1 : 1)[0] || null
  }
  const reparentCandidate = pendingDelete ? findReparentTarget(pendingDelete) : null

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      let url = `/api/pools/${pendingDelete.shareId}`
      if (pendingDelete.isOriginal && reparentCandidate) {
        url += `?reparent_to=${encodeURIComponent(reparentCandidate.shareId)}`
      }
      const res = await fetch(url, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      const data = await res.json().catch(() => null)
      if (pendingDelete.isOriginal) {
        if (reparentCandidate) {
          // Reparented — the new root takes over the URL.
          window.location.href = `/pool/${reparentCandidate.shareId}/deck`
        } else {
          // Whole pool was deleted.
          window.location.href = '/history'
        }
        return
      }
      // Non-root build deleted — if we were viewing it, jump back to root.
      if (activeShareId === pendingDelete.shareId) {
        window.location.href = `/pool/${shareId}/deck`
        return
      }
      setPendingDelete(null)
      setIsDeleting(false)
      window.dispatchEvent(new CustomEvent('wf:builds-changed', { detail: { rootShareId: shareId } }))
    } catch (err) {
      console.error('Delete failed:', err)
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
      setIsDeleting(false)
    }
  }

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
      <p className="pool-builds-label">Decks from this Pool:</p>
      <div className="pool-builds-list">
        {onCopyShare && (
          <button
            type="button"
            className="pool-build-card pool-build-share"
            onClick={onCopyShare}
            title="Copy share URL"
            aria-label="Copy share URL"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
        )}
        {visible.map(b => (
          <BuildCard
            key={b.shareId}
            build={b}
            rootShareId={shareId}
            isActive={b.shareId === activeShareId}
            currentUserId={currentUserId}
            isOwner={iOwnPool}
            onRequestDelete={setPendingDelete}
          />
        ))}
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
        {createBuildMessage && (
          <span className="pool-build-status">{createBuildMessage}</span>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="All Builds" showCloseButton>
        <Modal.Body>
          <div className="pool-builds-modal-sections">
            {groupBuildsByAuthor(builds).map(group => (
              <section
                key={group.key}
                className={`pool-builds-modal-section${group.key === 'original' ? ' pool-builds-modal-section--original' : ''}`}
              >
                <h3 className="pool-builds-modal-section-label">{group.label}</h3>
                <div className="pool-builds-modal-grid">
                  {group.builds.map(b => (
                    <BuildCard
                      key={b.shareId}
                      build={b}
                      rootShareId={shareId}
                      isActive={b.shareId === activeShareId}
                      currentUserId={currentUserId}
                      isOwner={iOwnPool}
                      onRequestDelete={setPendingDelete}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Modal.Body>
      </Modal>

      <ConfirmModal
        isOpen={!!pendingDelete}
        title={pendingDelete?.isOriginal && !reparentCandidate ? 'Delete entire pool?' : 'Delete this deck?'}
        confirmLabel="Delete"
        confirming={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => { setPendingDelete(null); setDeleteError(null) }}
      >
        {pendingDelete?.isOriginal && reparentCandidate ? (
          <p>
            Deleting the original deck. Your build{' '}
            <strong>
              {reparentCandidate.archetypeNickname
                ? stripFormat(reparentCandidate.archetypeNickname)
                : (reparentCandidate.leaderShortName || reparentCandidate.leaderName || 'next deck')}
            </strong>{' '}
            will become the new original for this pool.
          </p>
        ) : pendingDelete?.isOriginal ? (
          <p>
            This is your last deck for this pool. Deleting it will delete the entire pool and every build inside it. This action cannot be undone.
          </p>
        ) : (
          <p>Delete this deck? The pool and other builds are not affected.</p>
        )}
        {deleteError && <p style={{ color: '#E74C3C' }}>{deleteError}</p>}
      </ConfirmModal>
    </div>
  )
}
