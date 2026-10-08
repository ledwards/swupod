// Archetype + pool display naming.
//
// Archetype short names follow "Leader Color [HP]" or "Leader Splash Color [HP]"
// where Color is the BASE's aspect (Blue/Green/Red/Yellow) and HP is the base's
// health. The canonical name comes from the swuapi resolver (it knows splashes);
// when that's unavailable we build a degraded local fallback from the deck data
// so a deck never renders as a bare "Ahsoka" missing its "Blue 30".

import { packCountNameSuffix } from './sealedFormat'

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning'] as const

const ASPECT_COLOR_NAME: Record<string, string> = {
  Vigilance: 'Blue',
  Command: 'Green',
  Aggression: 'Red',
  Cunning: 'Yellow',
}

/** Base color word ("Blue") from a base card's aspects, or null if colorless. */
export function baseColorName(aspects?: string[] | null): string | null {
  if (!aspects?.length) return null
  const color = aspects.find((a) => (COLOR_ASPECTS as readonly string[]).includes(a))
  return color ? (ASPECT_COLOR_NAME[color] ?? null) : null
}

/** Strip trailing "(Limited)"/"(Premiere)" and embedded "(SET)" tokens. */
export function stripArchetypeTags(nickname: string): string {
  return nickname
    .replace(/\s*\((?:Limited|Premiere)\)\s*$/i, '')
    .replace(/\s*\([A-Z]{2,4}\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface ArchetypeShortNameInputs {
  archetypeNickname?: string | null
  leaderShortName?: string | null
  leaderName?: string | null
  baseAspects?: string[] | null
  baseHp?: number | null
  /** The base card's own name (e.g. "Alliance Outpost"). Used for named bases. */
  baseName?: string | null
  /** The base card's rarity. "Common" → generic colored base; else a named base. */
  baseRarity?: string | null
}

/**
 * The archetype short name: the resolved nickname (stripped of set/format) when
 * present, else a local fallback. Returns null with no leader.
 *
 * Fallback naming depends on the base's RARITY, not its HP:
 *   - COMMON bases are the generic colored bases (e.g. LAW commons are 27 HP,
 *     older sets 30) → "<Leader> <Color> <HP>"  e.g. "Vel Sartha Green 27".
 *   - RARE / SPECIAL bases are named bases (e.g. "Alliance Outpost" 26 HP,
 *     "Great Pit of Carkoon" 27 HP) → "<Leader> <BaseName>". Naming these
 *     "<Color> <HP>" is wrong because (a) the HP isn't the generic 30, and
 *     (b) multiple distinct named bases can share a color+HP, so the name
 *     would collide. We must use the base's actual name.
 */
export function archetypeShortName({
  archetypeNickname,
  leaderShortName,
  leaderName,
  baseAspects,
  baseHp,
  baseName,
  baseRarity,
}: ArchetypeShortNameInputs): string | null {
  if (archetypeNickname) {
    const stripped = stripArchetypeTags(archetypeNickname)
    if (stripped) return stripped
  }
  const leader = (leaderShortName || leaderName || '').trim()
  if (!leader) return null

  // Named (Rare/Special) base: use the base's real name, not "Color HP".
  const rarity = (baseRarity || '').trim().toLowerCase()
  const isNamedBase = rarity !== '' && rarity !== 'common'
  const trimmedBaseName = (baseName || '').trim()
  if (isNamedBase && trimmedBaseName) {
    return `${leader} ${trimmedBaseName}`
  }

  // Generic Common base: "<Leader> <Color> <HP>".
  const color = baseColorName(baseAspects)
  return [leader, color, baseHp ? String(baseHp) : null].filter(Boolean).join(' ')
}

/** MM.DD.YYYY (4-digit year). */
export function formatPoolDateLong(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}.${dd}.${d.getFullYear()}`
}

export interface PoolDisplayNameInputs {
  /** The archetype short name if the pool has a built deck (leader chosen). */
  archetypeShort?: string | null
  setCode?: string | null
  poolType?: string | null
  date?: string | Date | null
  /** Sealed packs opened for this pool — a format distinction (6-pack vs
   *  8-pack sealed are different formats). Omitted when unknown. */
  packCount?: number | null
}

/**
 * Canonical pool display name:
 *   - has a deck: "{Archetype Short Name} {(N-pack)} {MM.DD.YYYY}"  e.g. "Cad Splash Blue (8-pack) 04.13.2026"
 *   - no deck:    "{SET} {Draft|Sealed} {(N-pack)} {MM.DD.YYYY}"    e.g. "SEC Sealed (6-pack) 03.16.2026"
 * The pack parenthetical always sits immediately before the date, and is left
 * out entirely when the count is unknown (legacy pools).
 */
export function poolDisplayName({ archetypeShort, setCode, poolType, date, packCount }: PoolDisplayNameInputs): string {
  const datePart = formatPoolDateLong(date)
  const packs = packCountNameSuffix(packCount)
  const suffix = `${packs}${datePart ? ` ${datePart}` : ''}`
  const archetype = (archetypeShort || '').trim()
  if (archetype) return `${archetype}${suffix}`
  const fmt = poolType === 'draft' ? 'Draft' : 'Sealed'
  const set = (setCode || '').toUpperCase().trim()
  return `${set ? `${set} ` : ''}${fmt}${suffix}`.trim()
}
