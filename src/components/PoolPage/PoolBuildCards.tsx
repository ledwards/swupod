'use client'
import { useEffect, useState } from 'react'
import Button from '../Button'
import Modal from '../Modal'
import ConfirmModal from '../ConfirmModal'
import { AspectIcon } from '../AspectIcon'
import { archetypeShortName, stripArchetypeTags } from '../../utils/archetypeName'
import { formatRecord } from '../../utils/deckRecord'
import { buildHref, canDeleteBuild, groupBuildsByAuthor, poolDecks, reparentTarget, type PoolBuild } from '../../services/pools/poolPage'

const VISIBLE_LIMIT = 6

export const TrashIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>

function BuildCard({ build, rootShareId, deletable, onDelete }: { build: PoolBuild; rootShareId: string; deletable: boolean; onDelete: (b: PoolBuild) => void }) {
  const aspects = [...new Set([...(build.leaderAspects ?? []), ...(build.baseAspects ?? [])])]
  const name = archetypeShortName({
    archetypeNickname: build.archetypeNickname ?? null, leaderShortName: build.leaderShortName ?? null, leaderName: build.leaderName,
    baseAspects: build.baseAspects ?? null, baseHp: build.baseHp ?? null,
  }) || 'No leader'
  return (
    <div className="ppg-build">
      <a className="ppg-build-link" href={buildHref(rootShareId, build)}>
        <span className="ppg-build-name">
          {aspects.map(a => <AspectIcon key={a} aspect={a} size="sm"/>)}
          <span>{name}</span>
        </span>
        <span className="ppg-build-row">
          <span>by {build.builderName || 'Anonymous'}{build.isOriginal ? ' (Original)' : ''}</span>
          <span className="ppg-num">{formatRecord(build)}</span>
        </span>
      </a>
      {deletable && (
        <Button variant="danger" size="xs" className="ppg-build-trash" aria-label="Delete this deck" title="Delete this deck" onClick={() => onDelete(build)}>
          <TrashIcon/>
        </Button>
      )}
    </div>
  )
}

/**
 * Decks from this Pool (alpha): every build as a card with the deck's aspect
 * icons, its builder and record. Six show; the rest open All Builds, grouped
 * by builder. You can delete your own decks, or any deck on your pool.
 */
export default function PoolBuildCards({ shareId, currentUserId }: { shareId: string; currentUserId: string | null }) {
  const [builds, setBuilds] = useState<PoolBuild[] | null>(null)
  const [allOpen, setAllOpen] = useState(false)
  const [pending, setPending] = useState<PoolBuild | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const refetch = () => {
      fetch(`/api/pools/${shareId}/builds`)
        .then(res => (res.ok ? res.json() : null))
        .then(data => { if (!cancelled) setBuilds(data?.data?.builds ?? []) })
        .catch(() => { if (!cancelled) setBuilds([]) })
    }
    refetch()
    const onChanged = (e: Event) => {
      const root = (e as CustomEvent<{ rootShareId?: string }>).detail?.rootShareId
      if (!root || root === shareId) refetch()
    }
    window.addEventListener('wf:builds-changed', onChanged)
    return () => { cancelled = true; window.removeEventListener('wf:builds-changed', onChanged) }
  }, [shareId])

  if (!builds) return null
  const decks = poolDecks(builds)
  if (!decks.length) return null

  const ownerId = builds.find(b => b.isOriginal)?.builderUserId || null
  const ownsPool = Boolean(currentUserId && ownerId && currentUserId === ownerId)
  const promote = pending ? reparentTarget(builds, pending, currentUserId) : null
  const card = (b: PoolBuild) => <BuildCard key={b.shareId} build={b} rootShareId={shareId}
    deletable={canDeleteBuild(b, currentUserId, ownsPool)} onDelete={b => { setDeleteError(null); setPending(b) }}/>

  const confirmDelete = async () => {
    if (!pending) return
    setDeleting(true); setDeleteError(null)
    try {
      const url = `/api/pools/${pending.shareId}${pending.isOriginal && promote ? `?reparent_to=${encodeURIComponent(promote.shareId)}` : ''}`
      const res = await fetch(url, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      if (pending.isOriginal) {
        window.location.href = promote ? `/pools/${promote.shareId}/deck` : '/history'
        return
      }
      setPending(null)
      setDeleting(false)
      window.dispatchEvent(new CustomEvent('wf:builds-changed', { detail: { rootShareId: shareId } }))
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
      setDeleting(false)
    }
  }

  const overflow = decks.length - VISIBLE_LIMIT
  return (
    <div className="ppg-builds">
      <span className="ppg-builds-label">Decks from this Pool ({decks.length})</span>
      <div className="ppg-build-list">{decks.slice(0, VISIBLE_LIMIT).map(card)}</div>
      {overflow > 0 && <Button size="xs" className="ppg-builds-more" onClick={() => setAllOpen(true)}>+{overflow} More · View All {decks.length}</Button>}

      <Modal isOpen={allOpen} onClose={() => setAllOpen(false)} title="All Builds" showCloseButton className="modal--wide">
        <Modal.Body>
          <div className="ppg-groups">
            {groupBuildsByAuthor(decks).map(g => (
              <section key={g.key} className="ppg-group" aria-label={g.label}>
                <h3>{g.label}</h3>
                <div className="ppg-build-list">{g.builds.map(card)}</div>
              </section>
            ))}
          </div>
        </Modal.Body>
      </Modal>

      <ConfirmModal isOpen={!!pending} variant="danger" confirmLabel="Delete" confirming={deleting}
        title={pending?.isOriginal && !promote ? 'Delete entire pool?' : 'Delete this deck?'}
        onConfirm={() => void confirmDelete()} onCancel={() => { setPending(null); setDeleteError(null) }}>
        {pending?.isOriginal && promote
          ? <p>Deleting the original deck. Your build <strong>{promote.archetypeNickname ? stripArchetypeTags(promote.archetypeNickname) : (promote.leaderShortName || promote.leaderName || 'next deck')}</strong> will become the new original for this pool.</p>
          : pending?.isOriginal
            ? <p>This is your last deck for this pool. Deleting it will delete the entire pool and every build inside it. This action cannot be undone.</p>
            : <p>Delete this deck? The pool and other builds are not affected.</p>}
        {deleteError && <p role="alert" className="ppg-error">{deleteError}</p>}
      </ConfirmModal>
    </div>
  )
}
