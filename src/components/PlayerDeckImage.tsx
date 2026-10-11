'use client'
import { useEffect, useState } from 'react'
import Button from './Button'
import Modal from './Modal'
import { loadPool } from '../utils/poolApi'
import { renderPoolImageBlob } from '../services/deckImage'
import { jsonParse } from '../utils/json'
import './PlayerDeckImage.css'

type State = { cardPositions?: Record<string, { section: string; visible: boolean; enabled?: boolean; card: unknown }>; activeLeader?: string; activeBase?: string; poolName?: string }

/**
 * Another player's deck as the deck image (the same canvas render as the pool
 * page's Deck Image), opened from their draft pool. Shows the deck; the pool
 * column is one toggle away.
 */
export default function PlayerDeckImage({ poolShareId, username, onClose }: { poolShareId: string; username: string; onClose: () => void }) {
  const [images, setImages] = useState<{ deck?: string; pool?: string }>({})
  const [showPool, setShowPool] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [source, setSource] = useState<Parameters<typeof renderPoolImageBlob>[0] | null>(null)

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    void (async () => {
      try {
        const pool = await loadPool(poolShareId) as unknown as { deckBuilderState?: unknown; setCode: string; name?: string; owner?: { username?: string } | null }
        const state = jsonParse<State | null>(pool.deckBuilderState as string, null)
        if (!state?.cardPositions || !state.activeLeader || !state.activeBase) throw new Error('no deck')
        const params = {
          cardPositions: state.cardPositions as Parameters<typeof renderPoolImageBlob>[0]['cardPositions'],
          activeLeader: state.activeLeader, activeBase: state.activeBase,
          leaderCard: state.cardPositions[state.activeLeader]?.card ?? null,
          baseCard: state.cardPositions[state.activeBase]?.card ?? null,
          setCode: pool.setCode, poolType: 'draft' as const,
          poolName: state.poolName || pool.name || null, ownerUsername: pool.owner?.username || username,
          shareId: poolShareId, rootShareId: null,
        }
        const blob = await renderPoolImageBlob({ ...params, showSideboard: false })
        if (!blob) throw new Error('no image')
        if (cancelled) return
        const url = URL.createObjectURL(blob); urls.push(url)
        setSource(params); setImages({ deck: url })
      } catch { if (!cancelled) setError(true) }
    })()
    return () => { cancelled = true; urls.forEach(u => URL.revokeObjectURL(u)) }
  }, [poolShareId, username])
  useEffect(() => () => { if (images.pool) URL.revokeObjectURL(images.pool) }, [images.pool])

  const togglePool = async () => {
    if (showPool || images.pool || !source) { setShowPool(v => !v); return }
    setBusy(true)
    const blob = await renderPoolImageBlob({ ...source, showSideboard: true }).catch(() => null)
    setBusy(false)
    if (blob) { setImages(v => ({ ...v, pool: URL.createObjectURL(blob) })); setShowPool(true) }
  }
  const current = showPool ? images.pool : images.deck
  const download = () => {
    if (!current) return
    const a = document.createElement('a')
    a.href = current
    a.download = `ptp_${username.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${showPool ? 'pool' : 'deck'}.png`
    a.click()
  }

  return <Modal isOpen onClose={onClose} title={`${username}’s deck`} variant="wide" showCloseButton>
    <Modal.Body className="player-deck-image">
      {current ? <img src={current} alt={`${username}’s ${showPool ? 'pool' : 'deck'}`}/>
        : error ? <p role="alert">This deck could not be drawn.</p>
        : <div className="skeleton-block player-deck-image-skeleton" aria-busy="true" aria-label="Drawing the deck"/>}
    </Modal.Body>
    {current && <Modal.Actions>
      <Button variant="secondary" onClick={() => void togglePool()} disabled={busy}>{showPool ? 'Show deck' : 'Show pool'}</Button>
      <Button variant="primary" onClick={download}>Download</Button>
    </Modal.Actions>}
  </Modal>
}
