'use client'
import { useEffect, useMemo, useState } from 'react'
import Button from './Button'
import Modal from './Modal'
import CostIcon from './CostIcon'
import { AspectIcon } from './AspectIcon'
import DeckArt from './PodHub/DeckArt'
import { buildDeckView } from './Lobby/MatchDeckPane'
import { loadPool } from '../utils/poolApi'
import { renderPoolImageBlob } from '../services/deckImage'
import { createGetGroupKey, getCardTypeOrder, sortGroupKeys } from '../utils/cardSort'
import { archetypeShortName } from '../utils/archetypeName'
import { jsonParse } from '../utils/json'
import type { HubDeck } from '../services/pods/hubTypes'
import './PodHub/pod-hub.css'
import './PlayerDeckImage.css'

type State = { cardPositions?: Record<string, { section: string; visible: boolean; enabled?: boolean; card: unknown }>; activeLeader?: string; activeBase?: string; poolName?: string }
type PoolPayload = Parameters<typeof buildDeckView>[0] & { setCode: string; name?: string | null; owner?: { username?: string | null } | null }
type DeckView = NonNullable<ReturnType<typeof buildDeckView>>
type DeckCard = DeckView['deck'][number] & { subtitle?: string; hp?: number | string | null; rarity?: string }
interface Row { card: DeckCard; count: number }
interface Group { key: string; rows: Row[]; total: number }

// One fetch per pool, shared by the eye's hover prefetch and the modal; kept a minute so a deck being rebuilt stays fresh.
const POOL_TTL_MS = 60_000
const pools = new Map<string, { at: number; pool: Promise<PoolPayload> }>()
function fetchPool(poolShareId: string): Promise<PoolPayload> {
  const hit = pools.get(poolShareId)
  if (hit && Date.now() - hit.at < POOL_TTL_MS) return hit.pool
  const pool = loadPool(poolShareId) as unknown as Promise<PoolPayload>
  pools.set(poolShareId, { at: Date.now(), pool })
  pool.catch(() => pools.delete(poolShareId))
  return pool
}
/** Warm the pool fetch before the eye is clicked (hover, focus, touch). */
export function prefetchPlayerDeck(poolShareId: string): void { fetchPool(poolShareId).catch(() => {}) }

const costKey = createGetGroupKey('cost')
/** The deck builder's cost grouping (0…7, 8+); identical cards collapse to one row with a count. */
function groupByCost(cards: DeckCard[]): Group[] {
  const byKey = new Map<string, Map<string, Row>>()
  for (const card of cards) {
    const key = costKey(card)
    const rows = byKey.get(key) ?? new Map<string, Row>()
    byKey.set(key, rows)
    const id = card.id ?? card.name ?? ''
    const row = rows.get(id)
    if (row) row.count += 1
    else rows.set(id, { card, count: 1 })
  }
  return sortGroupKeys([...byKey.keys()], 'cost').map(key => {
    const rows = [...byKey.get(key)!.values()].sort((a, b) =>
      getCardTypeOrder(a.card) - getCardTypeOrder(b.card) || (a.card.name ?? '').localeCompare(b.card.name ?? ''))
    return { key, rows, total: rows.reduce((n, r) => n + r.count, 0) }
  })
}

function CardRows({ groups }: { groups: Group[] }) {
  return <div className="pdv-groups">
    {groups.map(g => <section key={g.key} className="pdv-group" aria-label={`Cost ${g.key}, ${g.total} cards`}>
      <h3 className="pdv-group-head"><CostIcon cost={g.key} size={22}/><span>{g.total}</span></h3>
      <ul className="pdv-rows">
        {g.rows.map(({ card, count }) => <li key={card.id ?? card.name} className="pdv-row">
          <span className="pdv-thumb">{card.imageUrl && <img src={card.imageUrl} alt="" loading="lazy" decoding="async"/>}</span>
          <span className="pdv-name" title={card.subtitle ? `${card.name}, ${card.subtitle}` : card.name}>{card.name}</span>
          <span className="pdv-aspects">{(card.aspects ?? []).map((a, i) => <AspectIcon key={`${a}-${i}`} aspect={a} size="sm"/>)}</span>
          <span className="pdv-count" aria-label={`${count} ${count === 1 ? 'copy' : 'copies'}`}>×{count}</span>
        </li>)}
      </ul>
    </section>)}
  </div>
}

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7]
function RowsSkeleton() {
  return <div className="pdv-groups" aria-busy="true" aria-label="Deck list">
    {[0, 1].map(g => <section key={g} className="pdv-group" aria-hidden="true">
      <div className="pdv-group-head"><span className="skeleton-block pdv-skel-cost"/></div>
      <ul className="pdv-rows">{SKELETON_ROWS.map(i => <li key={i} className="pdv-row"><span className="skeleton-block pdv-thumb"/><span className="skeleton-block pdv-skel-name"/></li>)}</ul>
    </section>)}
  </div>
}

/**
 * Another player's deck, opened from the pod page's eye: a native decklist
 * (leader and base art up top, the main deck by cost, the rest of the pool one
 * tab away). The deck image is drawn only when Download is pressed.
 */
export default function PlayerDeckImage({ poolShareId, username, deck = null, onClose }: { poolShareId: string; username: string; deck?: HubDeck | null; onClose: () => void }) {
  const [pool, setPool] = useState<PoolPayload | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<'deck' | 'pool'>('deck')
  const [busy, setBusy] = useState(false)
  const [downloadError, setDownloadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchPool(poolShareId).then(p => { if (!cancelled) setPool(p) }, () => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [poolShareId])

  const view = useMemo(() => (pool ? buildDeckView(pool) : null), [pool])
  const groups = useMemo(() => view ? { deck: groupByCost(view.deck as DeckCard[]), pool: groupByCost(view.sideboard as DeckCard[]) } : null, [view])

  // The header reuses the art the pod page already loaded; with no hub deck (leader results), the pool's own cards.
  const leader = view?.leader as DeckCard | null | undefined
  const base = view?.base as DeckCard | null | undefined
  const hero: HubDeck | null = deck ?? (leader || base ? {
    leaderName: leader?.name ?? 'Leader', leaderArt: leader?.imageUrl ?? null, baseName: base?.name ?? 'Base', baseArt: base?.imageUrl ?? null,
    archetype: archetypeShortName({ leaderName: leader?.name ?? null, baseAspects: base?.aspects ?? null, baseHp: Number(base?.hp) || null, baseName: base?.name ?? null, baseRarity: base?.rarity ?? null }),
  } : null)
  const title = hero?.archetype || hero?.leaderName || null

  const failed = error || (!!pool && !view)
  const deckCount = view?.deck.length ?? 0
  const poolCount = view?.sideboard.length ?? 0

  const download = async () => {
    if (!pool) return
    const state = jsonParse<State | null>(pool.deckBuilderState as string, null)
    if (!state?.cardPositions || !state.activeLeader || !state.activeBase) { setDownloadError(true); return }
    setBusy(true)
    setDownloadError(false)
    try {
      const blob = await renderPoolImageBlob({
        cardPositions: state.cardPositions as Parameters<typeof renderPoolImageBlob>[0]['cardPositions'],
        activeLeader: state.activeLeader, activeBase: state.activeBase,
        leaderCard: state.cardPositions[state.activeLeader]?.card ?? null,
        baseCard: state.cardPositions[state.activeBase]?.card ?? null,
        setCode: pool.setCode, poolType: 'draft',
        poolName: state.poolName || pool.name || null, ownerUsername: pool.owner?.username || username,
        shareId: poolShareId, rootShareId: null, showSideboard: tab === 'pool',
      })
      if (!blob) throw new Error('no image')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ptp_${username.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${tab}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setDownloadError(true) } finally { setBusy(false) }
  }

  return <Modal isOpen onClose={onClose} title={`${username}’s deck`} variant="wide" showCloseButton className="player-deck-modal">
    {hero && <div className="pod-deck-banner pdv-hero">
      <DeckArt deck={hero}/><span className="pod-shade"/>
      <span className="pod-deck-title">
        {title && <b>{title}</b>}
        <span>{hero.leaderName} · {hero.baseName}</span>
      </span>
    </div>}
    <div className="pdv-bar">
      <div className="pdv-tabs" role="tablist" aria-label="List">
        <Button variant="toggle" size="sm" role="tab" aria-selected={tab === 'deck'} active={tab === 'deck'} onClick={() => setTab('deck')}>Deck{view ? ` (${deckCount})` : ''}</Button>
        <Button variant="toggle" size="sm" role="tab" aria-selected={tab === 'pool'} active={tab === 'pool'} onClick={() => setTab('pool')} disabled={!!view && poolCount === 0}>Pool{view ? ` (${poolCount})` : ''}</Button>
      </div>
      <Button variant="secondary" size="sm" className="pdv-download" onClick={() => void download()} disabled={!view || busy} aria-busy={busy || undefined}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>
        Download
      </Button>
    </div>
    {downloadError && <p className="pdv-download-error" role="alert">The image could not be drawn.</p>}
    <Modal.Body className="pdv-body">
      {failed ? <p role="alert">This deck could not be loaded.</p>
        : !groups ? <RowsSkeleton/>
        : <CardRows groups={groups[tab]}/>}
    </Modal.Body>
  </Modal>
}
