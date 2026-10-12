'use client'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button'
import Modal from './Modal'
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
interface Group { key: Kind; rows: Row[]; total: number }

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

/** Melee.gg's decklist order: Leader, Base, then Units, Events, Upgrades; each by cost, then name. */
const TYPES = ['Leader', 'Base', 'Units', 'Events', 'Upgrades', 'Other'] as const
type Kind = (typeof TYPES)[number]
function typeOf(card: DeckCard): Kind {
  const t = String(card.type ?? '')
  if (card.isLeader || /leader/i.test(t)) return 'Leader'
  if (card.isBase || /base/i.test(t)) return 'Base'
  if (/unit/i.test(t)) return 'Units'
  if (/upgrade/i.test(t)) return 'Upgrades'
  if (/event/i.test(t)) return 'Events'
  return 'Other'
}
/** The chosen leader and base lead, then the cards by type. */
function groupByType(cards: DeckCard[], leader?: DeckCard | null, base?: DeckCard | null): Group[] {
  const rows = new Map<string, Row>()
  for (const card of cards) {
    const id = card.id ?? card.name ?? ''
    const row = rows.get(id)
    if (row) row.count += 1
    else rows.set(id, { card, count: 1 })
  }
  const sorted = [...rows.values()].sort((a, b) =>
    (a.card.cost ?? 99) - (b.card.cost ?? 99) || (a.card.name ?? '').localeCompare(b.card.name ?? ''))
  const head: Group[] = ([['Leader', leader], ['Base', base]] as const).flatMap(([key, card]) => card ? [{ key, rows: [{ card, count: 1 }], total: 1 }] : [])
  const body = TYPES.filter(t => !head.some(h => h.key === t)).map(key => {
    const list = sorted.filter(r => typeOf(r.card) === key)
    return { key, rows: list, total: list.reduce((n, r) => n + r.count, 0) }
  }).filter(g => g.rows.length > 0)
  return [...head, ...body].sort((a, b) => TYPES.indexOf(a.key) - TYPES.indexOf(b.key))
}

const CURVE = ['0', '1', '2', '3', '4', '5', '6', '7+']
function Summary({ groups }: { groups: Group[] }) {
  const bins = CURVE.map(() => 0)
  for (const g of groups) for (const r of g.rows) {
    if (typeof r.card.cost === 'number' && g.key !== 'Leader' && g.key !== 'Base') { const k = Math.min(7, Math.max(0, r.card.cost)); bins[k] = (bins[k] ?? 0) + r.count }
  }
  const top = Math.max(1, ...bins)
  const count = (key: Kind) => groups.find(g => g.key === key)?.total ?? 0
  return <div className="pdv-summary">
    <ol className="pdv-curve" aria-label={`Cost curve: ${CURVE.map((c, i) => `${bins[i]} at ${c}`).join(', ')}`}>
      {CURVE.map((c, i) => <li key={c} aria-hidden="true">
        <span className="pdv-curve-n">{bins[i] || ''}</span>
        <span className="pdv-curve-bar" style={{ '--h': bins[i]! / top } as CSSProperties}/>
        <span className="pdv-curve-c">{c}</span>
      </li>)}
    </ol>
    <dl className="pdv-types">
      {(['Units', 'Events', 'Upgrades'] as const).map(t => <div key={t}><dd>{count(t)}</dd><dt>{t}</dt></div>)}
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

const labelOf = (card: DeckCard) => card.subtitle ? `${card.name}, ${card.subtitle}` : (card.name ?? '')
/** Mouse hover previews the card; a tap (touch, pen) shows it centred until dismissed. */
function usePreviewHandlers(preview: Preview, onTap: (card: DeckCard) => void) {
  const pointer = useRef('')
  return (card: DeckCard) => ({
    onPointerDown: (e: React.PointerEvent) => { pointer.current = e.pointerType },
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === 'mouse' && card.imageUrl) preview.handleCardMouseEnter(previewCard(card), e) },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') preview.handleCardMouseLeave() },
    onClick: () => { const how = pointer.current; pointer.current = ''; if ((how === 'touch' || how === 'pen') && card.imageUrl) onTap(card) },
  })
}
/** Grid: small card images in rows by type, a count badge on each. The leader and base share the first row. */
function CardGrid({ groups, preview, onTap }: { groups: Group[]; preview: Preview; onTap: (card: DeckCard) => void }) {
  const handlers = usePreviewHandlers(preview, onTap)
  const head = groups.filter(g => g.key === 'Leader' || g.key === 'Base'), rest = groups.filter(g => g.key !== 'Leader' && g.key !== 'Base')
  const tile = ({ card, count }: Row) => <li key={card.id ?? card.name}>
    <button type="button" className="pdv-card" aria-label={`${count} × ${labelOf(card)}`} title={labelOf(card)} {...handlers(card)}>
      {card.imageUrl && <img src={card.imageUrl} alt="" loading="lazy" decoding="async"/>}
      <span className="pdv-badge" aria-hidden="true">×{count}</span>
    </button>
  </li>
  const section = (title: string, n: number, rows: Row[], lead = false) => <section key={title} className="pdv-group" aria-label={`${title}, ${n} ${n === 1 ? 'card' : 'cards'}`}>
    <h3 className="pdv-group-head"><span>{title}</span><span>{n}</span></h3>
    <ul className={`pdv-cards${lead ? ' is-lead' : ''}`}>{rows.map(tile)}</ul>
  </section>
  return <div className="pdv-grid">
    {head.length > 0 && section(head.map(g => g.key).join(' & '), head.reduce((n, g) => n + g.total, 0), head.flatMap(g => g.rows), true)}
    {rest.map(g => section(g.key, g.total, g.rows))}
  </div>
}
/** List: a Melee.gg style text decklist in two columns, "count  Card Name"; hovering a name shows the card. */
function CardList({ groups, preview, onTap }: { groups: Group[]; preview: Preview; onTap: (card: DeckCard) => void }) {
  const handlers = usePreviewHandlers(preview, onTap)
  return <div className="pdv-list">
    {groups.map(g => <section key={g.key} className="pdv-list-group" aria-label={`${g.key}, ${g.total} ${g.total === 1 ? 'card' : 'cards'}`}>
      <h3 className="pdv-list-head">{g.key === 'Leader' || g.key === 'Base' ? g.key : `${g.key} (${g.total})`}</h3>
      <ul>{g.rows.map(({ card, count }) => <li key={card.id ?? card.name}>
        <span className="pdv-list-n">{count}</span>
        <button type="button" className="pdv-list-name" title={labelOf(card)} {...handlers(card)}>{card.name}</button>
      </li>)}</ul>
    </section>)}
  </div>
}

type View = 'grid' | 'list'
function Skeleton({ view }: { view: View }) {
  return view === 'grid'
    ? <div className="pdv-grid" aria-busy="true" aria-label="Deck list">{[0, 1].map(g => <section key={g} className="pdv-group" aria-hidden="true">
        <div className="pdv-group-head"><span className="skeleton-block pdv-skel-head"/></div>
        <ul className="pdv-cards">{[0, 1, 2, 3, 4].map(i => <li key={i}><span className="skeleton-block pdv-card is-skeleton"/></li>)}</ul>
      </section>)}</div>
    : <div className="pdv-list" aria-busy="true" aria-label="Deck list">{[0, 1].map(g => <section key={g} className="pdv-list-group" aria-hidden="true">
        <div className="pdv-list-head"><span className="skeleton-block pdv-skel-head"/></div>
        <ul>{[0, 1, 2, 3, 4, 5].map(i => <li key={i}><span className="skeleton-block pdv-skel-line"/></li>)}</ul>
      </section>)}</div>
}
// The chosen view outlives the modal (the Play page's decklist shares the key); storage can be missing or blocked, and then Grid it is.
const VIEW_KEY = 'decklist-view'
function readView(): View { try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' } }
function saveView(v: View): void { try { localStorage.setItem(VIEW_KEY, v) } catch { /* the choice lasts this visit */ } }
const GridGlyph = () => <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>
const ListGlyph = () => <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h1.5M6 4h8M2 8h1.5M6 8h8M2 12h1.5M6 12h8"/></svg>

/**
 * Another player's deck, opened from the pod page's eye, in the same design as the
 * Play page's decklist: leader and base art up top; Deck / Entire Pool, the Grid /
 * List switch and Download on one bar; the cost curve and type counts; then the
 * cards as small images by type (Grid, the default) or a Melee.gg style two-column
 * text list. Hovering a card shows it full size; a tap shows it centred. The deck
 * image is drawn only when Download is pressed.
 */
export default function PlayerDeckImage({ poolShareId, username, deck = null, onClose }: { poolShareId: string; username: string; deck?: HubDeck | null; onClose: () => void }) {
  const [pool, setPool] = useState<PoolPayload | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<'deck' | 'pool'>('deck')
  const [mode, setMode] = useState<View>(readView)
  const choose = (v: View) => { setMode(v); saveView(v) }
  const [busy, setBusy] = useState(false)
  const [downloadError, setDownloadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchPool(poolShareId).then(p => { if (!cancelled) setPool(p) }, () => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [poolShareId])

  const view = useMemo(() => (pool ? buildDeckView(pool) : null), [pool])
  // Entire Pool is every card the build knows: the chosen leader and base, the deck and the sideboard.
  const groups = useMemo(() => view ? { deck: groupByType(view.deck as DeckCard[], view.leader as DeckCard | null, view.base as DeckCard | null), pool: groupByType([...view.deck, ...view.sideboard] as DeckCard[], view.leader as DeckCard | null, view.base as DeckCard | null) } : null, [view])
  const preview = useCardPreview()
  const [tapped, setTapped] = useState<DeckCard | null>(null)
  useEffect(() => { preview.dismissPreview(); setTapped(null) }, [tab, mode]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="pdv-seg pdv-tabs" role="tablist" aria-label="Deck or entire pool">
        <button type="button" role="tab" aria-selected={tab === 'deck'} onClick={() => setTab('deck')}>Deck{view && <> <span className="pdv-seg-n">{deckCount}</span></>}</button>
        <button type="button" role="tab" aria-selected={tab === 'pool'} onClick={() => setTab('pool')}>Entire Pool{view && <> <span className="pdv-seg-n">{deckCount + poolCount}</span></>}</button>
      </div>
      <div className="pdv-seg pdv-views" role="group" aria-label="View">
        <button type="button" aria-pressed={mode === 'grid'} aria-label="Grid" title="Grid" onClick={() => choose('grid')}><GridGlyph/><span>Grid</span></button>
        <button type="button" aria-pressed={mode === 'list'} aria-label="List" title="List" onClick={() => choose('list')}><ListGlyph/><span>List</span></button>
      </div>
      <Button variant="secondary" size="sm" className="pdv-download" onClick={() => void download()} disabled={!view || busy} aria-busy={busy || undefined} aria-label="Download" title="Download image">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>
        <span>Download</span>
      </Button>
    </div>
    {downloadError && <p className="pdv-download-error" role="alert">The image could not be drawn.</p>}
    {groups && !failed && <Summary groups={groups[tab]}/>}
    <Modal.Body className={`pdv-body is-${mode}`}>
      {failed ? <p role="alert">This deck could not be loaded.</p>
        : !groups ? <Skeleton view={mode}/>
        : mode === 'grid' ? <CardGrid groups={groups[tab]} preview={preview} onTap={setTapped}/>
        : <CardList groups={groups[tab]} preview={preview} onTap={setTapped}/>}
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
