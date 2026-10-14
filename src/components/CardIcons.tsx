/**
 * The one rarity icon and the one card-kind icon, site-wide.
 *
 * Rarity uses the official lettered SWU rarity icons in public/icons/rarity
 * (C, U, R, L, S). Kind uses the deck builder's outline glyphs (person, rocket, bolt,
 * arrow), tinted with the --pt-kind-* game-data colors. Neither colour ever
 * travels alone: pair the icon with its label wherever space allows
 * (RarityLabel / KindLabel), and the icon itself always carries a name.
 */
import './CardIcons.css'

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Legendary' | 'Special'
export type CardKind = 'ground' | 'space' | 'event' | 'upgrade'

const RARITIES: Record<string, Rarity> = {
  common: 'Common', c: 'Common',
  uncommon: 'Uncommon', u: 'Uncommon',
  rare: 'Rare', r: 'Rare',
  legendary: 'Legendary', l: 'Legendary',
  special: 'Special', s: 'Special',
}

/** 'Rare', 'rare' and 'R' all mean Rare; anything else is not a rarity. */
export function normalizeRarity(value: unknown): Rarity | null {
  return typeof value === 'string' ? RARITIES[value.trim().toLowerCase()] ?? null : null
}

const KINDS: Record<string, CardKind> = {
  ground: 'ground', 'ground unit': 'ground', 'ground units': 'ground', unit: 'ground', units: 'ground',
  space: 'space', 'space unit': 'space', 'space units': 'space',
  event: 'event', events: 'event',
  upgrade: 'upgrade', upgrades: 'upgrade',
}

/** Accepts sort-group keys ("Ground Units"), card types ("Upgrade") and arenas ("Space"). */
export function normalizeKind(value: unknown): CardKind | null {
  return typeof value === 'string' ? KINDS[value.trim().toLowerCase()] ?? null : null
}

export const KIND_LABELS: Record<CardKind, string> = {ground: 'Ground', space: 'Space', event: 'Event', upgrade: 'Upgrade'}

export function RarityIcon({rarity, size = 16, className = ''}: {rarity: unknown; size?: number; className?: string}) {
  const name = normalizeRarity(rarity)
  if (!name) return null
  return <img className={`rarity-icon ${className}`.trim()} src={`/icons/rarity/${name.toLowerCase()}.png`} alt={name} title={name} width={size} height={size} loading="lazy"/>
}

/** Icon plus name. Unknown rarities fall back to the raw text (or nothing). */
export function RarityLabel({rarity, size = 14, className = ''}: {rarity: unknown; size?: number; className?: string}) {
  const name = normalizeRarity(rarity)
  if (!name) return typeof rarity === 'string' && rarity ? <span className={className}>{rarity}</span> : null
  return (
    <span className={`rarity-label ${className}`.trim()}>
      <img className="rarity-icon" src={`/icons/rarity/${name.toLowerCase()}.png`} alt="" aria-hidden="true" width={size} height={size} loading="lazy"/>
      {name}
    </span>
  )
}

function KindGlyph({kind}: {kind: CardKind}) {
  switch (kind) {
    case 'ground':
      return <><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></>
    case 'space':
      return <>
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
        <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
      </>
    case 'upgrade':
      return <><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></>
    case 'event':
      return <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  }
}

/**
 * Outline glyph for a card kind. `tinted` (default) draws it in the kind's game-data colour;
 * `tinted={false}` inherits the surrounding text colour (headers, buttons).
 */
export function KindIcon({kind, size = 18, tinted = true, className = '', label}: {kind: unknown; size?: number; tinted?: boolean; className?: string; label?: string | undefined}) {
  const k = normalizeKind(kind)
  if (!k) return null
  const name = label ?? KIND_LABELS[k]
  return (
    <svg className={`kind-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={tinted ? {color: `var(--pt-kind-${k})`} : undefined} role="img" aria-label={name}>
      <title>{name}</title>
      <KindGlyph kind={k}/>
    </svg>
  )
}

/** Icon plus name ("Ground", or a custom label such as "Ground Units (12)"). */
export function KindLabel({kind, label, size = 16, tinted = true, className = ''}: {kind: unknown; label?: string | undefined; size?: number; tinted?: boolean; className?: string}) {
  const k = normalizeKind(kind)
  if (!k) return label ? <span className={className}>{label}</span> : null
  return (
    <span className={`kind-label ${className}`.trim()}>
      <svg className="kind-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={tinted ? {color: `var(--pt-kind-${k})`} : undefined} aria-hidden="true">
        <KindGlyph kind={k}/>
      </svg>
      {label ?? KIND_LABELS[k]}
    </span>
  )
}
