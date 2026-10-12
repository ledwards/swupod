'use client'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button'
import Modal from './Modal'
import CostIcon from './CostIcon'
import { AspectIcon } from './AspectIcon'
import DeckArt from './PodHub/DeckArt'
import { buildDeckView } from './Lobby/MatchDeckPane'
import { loadPool } from '../utils/poolApi'
import { renderPoolImageBlob } from '../services/deckImage'
import { useCardPreview } from '../hooks/useCardPreview'
import { CardPreview, type PreviewCard } from './DeckBuilder/CardPreview'
import { archetypeShortName } from '../utils/archetypeName'
import { jsonParse } from '../utils/json'
import type { HubDeck } from '../services/pods/hubTypes'
import './PodHub/pod-hub.css'
import './PlayerDeckImage.css'

type State = { cardPositions?: Record<string, { section: string; visible: boolean; enabled?: boolean; card: unknown }>; activeLeader?: string; activeBase?: string; poolName?: string }
type PoolPayload = Parameters<typeof buildDeckView>[0] & { setCode: string; name?: string | null; owner?: { username?: string | null } | null }
type DeckView = NonNullable<ReturnType<typeof buildDeckView>>
type DeckCard = DeckView['deck'][number] & { subtitle?: string; hp?: number | string | null; rarity?: string; backImageUrl?: string | null }
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

/** Wayfinder's decklist order: Units, Upgrades, Events (leaders and bases only appear in a pool); each by cost, then name. */
const TYPES = ['Units', 'Upgrades', 'Events', 'Leaders', 'Bases', 'Other'] as const
function typeOf(card: DeckCard): (typeof TYPES)[number] {
  const t = String(card.type ?? '')
  if (card.isLeader || /leader/i.test(t)) return 'Leaders'
  if (card.isBase || /base/i.test(t)) return 'Bases'
  if (/unit/i.test(t)) return 'Units'
  if (/upgrade/i.test(t)) return 'Upgrades'
  if (/event/i.test(t)) return 'Events'
  return 'Other'
}
function groupByType(cards: DeckCard[]): Group[] {
  const rows = new Map<string, Row>()
  for (const card of cards) {
    const id = card.id ?? card.name ?? ''
    const row = rows.get(id)
    if (row) row.count += 1
    else rows.set(id, { card, count: 1 })
  }
  const sorted = [...rows.values()].sort((a, b) =>
    (a.card.cost ?? 99) - (b.card.cost ?? 99) || (a.card.name ?? '').localeCompare(b.card.name ?? ''))
  return TYPES.map(key => {
    const list = sorted.filter(r => typeOf(r.card) === key)
    return { key, rows: list, total: list.reduce((n, r) => n + r.count, 0) }
  }).filter(g => g.rows.length > 0)
}
/** The cost cell's colour: the card's own aspect, Heroism or Villainy only when it has nothing else. */
function aspectOf(aspects: string[] = []): string {
  return (aspects.find(a => !/heroism|villainy/i.test(a)) ?? aspects[0] ?? 'none').toLowerCase()
}

const CURVE = ['0', '1', '2', '3', '4', '5', '6', '7+']
function Summary({ groups }: { groups: Group[] }) {
  const bins = CURVE.map(() => 0)
  for (const g of groups) for (const r of g.rows) {
    if (typeof r.card.cost === 'number' && g.key !== 'Leaders') { const k = Math.min(7, Math.max(0, r.card.cost)); bins[k] = (bins[k] ?? 0) + r.count }
  }
  const top = Math.max(1, ...bins)
  const count = (key: string) => groups.find(g => g.key === key)?.total ?? 0
  return <div className="pdv-summary">
    <ol className="pdv-curve" aria-label={`Cost curve: ${CURVE.map((c, i) => `${bins[i]} at ${c}`).join(', ')}`}>
      {CURVE.map((c, i) => <li key={c} aria-hidden="true">
        <span className="pdv-curve-n">{bins[i] || ''}</span>
        <span className="pdv-curve-bar" style={{ '--h': bins[i]! / top } as CSSProperties}/>
        <span className="pdv-curve-c">{c}</span>
      </li>)}
    </ol>
    <dl className="pdv-types">
      {(['Units', 'Upgrades', 'Events'] as const).map(t => <div key={t}><dd>{count(t)}</dd><dt>{t}</dt></div>)}
    </dl>
  </div>
}

type Preview = ReturnType<typeof useCardPreview>
/** Closing a tapped preview must not also land its tap on what is underneath (the overlay would close the modal). */
function swallowNextClick(): void {
  const swallow = (e: Event) => { e.stopPropagation(); e.preventDefault() }
  document.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => document.removeEventListener('click', swallow, true), 400)
}
function previewCard(card: DeckCard): PreviewCard & Record<string, unknown> {
  const p: PreviewCard & Record<string, unknown> = { isLeader: !!card.isLeader, isBase: !!card.isBase }
  if (card.name) p.name = card.name
  if (card.imageUrl) p.imageUrl = card.imageUrl
  if (card.backImageUrl) p.backImageUrl = card.backImageUrl
  return p
}

/** One Hearthstone Top Decks style bar: cost pip | name, aspects | art fading in | count. Hover or tap for the full card. */
function CardRows({ groups, preview, onTap }: { groups: Group[]; preview: Preview; onTap: (card: DeckCard) => void }) {
  const pointer = useRef('')
  return <div className="pdv-groups">
    {groups.map(g => <section key={g.key} className="pdv-group" aria-label={`${g.key}, ${g.total} cards`}>
      <h3 className="pdv-group-head"><span>{g.key}</span><span>{g.total}</span></h3>
      <ul className="pdv-rows">
        {g.rows.map(({ card, count }) => <li key={card.id ?? card.name}>
          <button type="button" className={`pdv-row is-${aspectOf(card.aspects)}`} title={card.subtitle ? `${card.name}, ${card.subtitle}` : card.name}
            onPointerDown={e => { pointer.current = e.pointerType }}
            onPointerEnter={e => { if (e.pointerType === 'mouse' && card.imageUrl) preview.handleCardMouseEnter(previewCard(card), e) }}
            onPointerLeave={e => { if (e.pointerType === 'mouse') preview.handleCardMouseLeave() }}
            onClick={() => { const how = pointer.current; pointer.current = ''; if ((how === 'touch' || how === 'pen') && card.imageUrl) onTap(card) }}>
            <span className="pdv-pip"><CostIcon cost={card.cost ?? '–'} size={26}/></span>
            <span className="pdv-art" aria-hidden="true">{card.imageUrl && <img className={`is-${typeOf(card).toLowerCase()}`} src={card.imageUrl} alt="" loading="lazy" decoding="async"/>}</span>
            <span className="pdv-name">{card.name}</span>
            <span className="pdv-aspects">{(card.aspects ?? []).map((a, i) => <AspectIcon key={`${a}-${i}`} aspect={a} size="sm"/>)}</span>
            <span className="pdv-count" aria-label={`${count} ${count === 1 ? 'copy' : 'copies'}`}>×{count}</span>
          </button>
        </li>)}
      </ul>
    </section>)}
  </div>
}

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7]
function RowsSkeleton() {
  return <div className="pdv-groups" aria-busy="true" aria-label="Deck list">
    {[0, 1].map(g => <section key={g} className="pdv-group" aria-hidden="true">
      <div className="pdv-group-head"><span className="skeleton-block pdv-skel-head"/></div>
      <ul className="pdv-rows">{SKELETON_ROWS.map(i => <li key={i}><span className="skeleton-block pdv-row is-skeleton"/></li>)}</ul>
    </section>)}
  </div>
}

/**
 * Another player's deck, opened from the pod page's eye: a narrow decklist after
 * Hearthstone Top Decks and Wayfinder (leader and base art up top, Deck / Pool,
 * the cost curve and type counts, then slim card bars by type). Hovering a bar
 * shows the full card; a tap shows it centred. The deck image is drawn only when
 * Download is pressed.
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
  const groups = useMemo(() => view ? { deck: groupByType(view.deck as DeckCard[]), pool: groupByType(view.sideboard as DeckCard[]) } : null, [view])
  const preview = useCardPreview()
  const [tapped, setTapped] = useState<DeckCard | null>(null)
  useEffect(() => { preview.dismissPreview(); setTapped(null) }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

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
    {groups && !failed && <Summary groups={groups[tab]}/>}
    <Modal.Body className="pdv-body">
      {failed ? <p role="alert">This deck could not be loaded.</p>
        : !groups ? <RowsSkeleton/>
        : <CardRows groups={groups[tab]} preview={preview} onTap={setTapped}/>}
    </Modal.Body>
    {/* The full card sits above the modal: on hover beside the pointer, on a tap centred until dismissed. */}
    {typeof document !== 'undefined' && (preview.hoveredCardPreview || tapped) && createPortal(<div className="pdv-preview-layer">
      {tapped
        ? <CardPreview card={previewCard(tapped)} x={0} y={0} isMobile onDismiss={() => { setTapped(null); swallowNextClick() }}/>
        : <CardPreview card={preview.hoveredCardPreview!.card as PreviewCard} x={preview.hoveredCardPreview!.x} y={preview.hoveredCardPreview!.y} isMobile={preview.hoveredCardPreview!.isMobile}
            onMouseEnter={preview.handlePreviewMouseEnter} onMouseLeave={preview.handlePreviewMouseLeave} onDismiss={preview.dismissPreview}/>}
    </div>, document.body)}
  </Modal>
}
