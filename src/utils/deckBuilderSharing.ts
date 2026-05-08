export interface SharedPoolPlayOptions {
  isInfiniteMode?: boolean
  isOwner?: boolean
  shareId?: string | null
  draftShareId?: string | null
}

export function shouldBuildFromSharedPool({
  isInfiniteMode = false,
  isOwner = false,
  shareId = null,
  draftShareId = null,
}: SharedPoolPlayOptions): boolean {
  return Boolean(!isInfiniteMode && !isOwner && shareId && !draftShareId)
}

export function getBuildName(parentName: string | null | undefined, displayName: string | null | undefined): string | null {
  if (!parentName) return null
  return displayName ? `${parentName} – ${displayName}'s Build` : `${parentName} (Build)`
}

export function getBuildDeckBuilderState(currentState: unknown, fallbackState: unknown): unknown {
  if (!currentState || typeof currentState !== 'object') {
    return fallbackState
  }

  const state = currentState as Record<string, unknown>
  const hasDeckState =
    'cardPositions' in state ||
    'activeLeader' in state ||
    'activeBase' in state ||
    'poolName' in state

  return hasDeckState ? currentState : fallbackState
}

// === Default-name generation ===========================================
//
// Pools and builds get an auto-generated name when they are created.
// `isDefaultName` (stored on `deck_builder_state`) tracks whether the
// current name is still the auto-default (true) or has been edited by the
// user (false). Auto-rename only fires while `isDefaultName === true`.

export type PoolFormat = 'sealed' | 'draft' | string

export function formatPoolDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${mm}.${dd}.${yy}`
}

function formatLabel(poolType: PoolFormat | null | undefined): string {
  return poolType === 'draft' ? 'Draft' : 'Sealed'
}

// Strip trailing format and embedded set tokens from an archetype nickname.
// e.g. "Saw Splash Blue (LAW) (Limited)" → "Saw Splash Blue"
export function stripArchetypeSetAndFormat(nickname: string): string {
  return nickname
    .replace(/\s*\((?:Limited|Premiere)\)\s*$/i, '')
    .replace(/\s*\([A-Z]{2,4}\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// "{owner}'s {SET} {Sealed|Draft} Pool {MM.DD.YY}"  e.g. "terronk's LAW Sealed Pool 05.28.26"
export interface DefaultPoolNameInputs {
  ownerName?: string | null
  setCode?: string | null
  poolType?: PoolFormat | null
  createdAt?: Date | string | null
}

export function getDefaultPoolName({ ownerName, setCode, poolType, createdAt }: DefaultPoolNameInputs): string {
  const owner = ownerName?.trim()
  const set = (setCode || '').toUpperCase()
  const fmt = formatLabel(poolType)
  const date = formatPoolDate(createdAt)
  const ownerPart = owner ? `${owner}'s ` : ''
  const setPart = set ? `${set} ` : ''
  const datePart = date ? ` ${date}` : ''
  return `${ownerPart}${setPart}${fmt} Pool${datePart}`.trim()
}

// "{archetype-without-set-or-format} ({SET}) {Sealed|Draft} {MM.DD.YY}"
// e.g. "Saw Splash Blue (LAW) Sealed 05.28.26"
// If no archetype is known yet, fall back to {parentName} – {displayName}'s Build (legacy).
export interface DefaultBuildNameInputs {
  archetypeNickname?: string | null
  setCode?: string | null
  poolType?: PoolFormat | null
  createdAt?: Date | string | null
  parentName?: string | null
  displayName?: string | null
}

export function getDefaultBuildName({
  archetypeNickname,
  setCode,
  poolType,
  createdAt,
  parentName,
  displayName,
}: DefaultBuildNameInputs): string | null {
  if (archetypeNickname) {
    const archetype = stripArchetypeSetAndFormat(archetypeNickname)
    const set = (setCode || '').toUpperCase()
    const fmt = formatLabel(poolType)
    const date = formatPoolDate(createdAt)
    const setPart = set ? ` (${set})` : ''
    const datePart = date ? ` ${date}` : ''
    return `${archetype}${setPart} ${fmt}${datePart}`.trim()
  }
  return getBuildName(parentName, displayName)
}

// === Archetype resolution (client-side) ================================

const SWUAPI_RESOLVE_URL = 'https://api.swuapi.com/archetypes/resolve'

interface ResolveLookup {
  uuid: string
  set: string
  number: string
  isLeader: boolean
  isBase: boolean
}

let archetypeIndexes: { leaders: Map<string, string>; bases: Map<string, string> } | null = null

function buildIndexesFromCards(cards: ResolveLookup[]) {
  const leaders = new Map<string, string>()
  const bases = new Map<string, string>()
  for (const c of cards) {
    if (!c.uuid || !c.set || c.number == null) continue
    const key = `${c.set}:${String(c.number)}`
    if (c.isLeader && !leaders.has(key)) leaders.set(key, c.uuid)
    if (c.isBase && !bases.has(key)) bases.set(key, c.uuid)
  }
  return { leaders, bases }
}

export function ensureArchetypeIndexes(cards: ResolveLookup[]) {
  if (!archetypeIndexes) archetypeIndexes = buildIndexesFromCards(cards)
}

export function resolveArchetypeUuid(card: { id?: string; set?: string; number?: string | number }, kind: 'leader' | 'base'): string | null {
  if (!card) return null
  // Already a UUID?
  if (typeof card.id === 'string' && card.id.includes('-')) return card.id
  if (!archetypeIndexes) return null
  if (!card.set || card.number == null) return null
  const key = `${card.set}:${String(card.number)}`
  return (kind === 'leader' ? archetypeIndexes.leaders : archetypeIndexes.bases).get(key) || null
}

// In-memory cache for the lifetime of the session. Keyed by leader+base+format.
const nicknameCache = new Map<string, string | null>()

export async function fetchArchetypeNickname(
  leaderUuid: string | null,
  baseUuid: string | null,
  format: 'Limited' | 'Premiere' = 'Limited',
): Promise<string | null> {
  if (!leaderUuid || !baseUuid) return null
  const key = `${leaderUuid}:${baseUuid}:${format}`
  if (nicknameCache.has(key)) return nicknameCache.get(key) ?? null
  try {
    const url = `${SWUAPI_RESOLVE_URL}?leader_card_uuid=${leaderUuid}&base_card_uuid=${baseUuid}&format=${format}`
    const res = await fetch(url)
    if (!res.ok) {
      nicknameCache.set(key, null)
      return null
    }
    const data = await res.json()
    const nickname = data?.nickname || null
    nicknameCache.set(key, nickname)
    return nickname
  } catch {
    nicknameCache.set(key, null)
    return null
  }
}

// Subtitle to show when the user has customized the pool/build name. Always
// renders the canonical default form so the user can still see the set,
// format, owner, and date.
export interface CanonicalSubtitleInputs {
  ownerName?: string | null
  setCode?: string | null
  poolType?: PoolFormat | null
  createdAt?: Date | string | null
}

export function getCanonicalPoolSubtitle({ ownerName, setCode, poolType, createdAt }: CanonicalSubtitleInputs): string {
  const set = (setCode || '').toUpperCase()
  const fmt = formatLabel(poolType)
  const date = formatPoolDate(createdAt)
  const owner = ownerName?.trim()
  const setPart = set ? `${set} ` : ''
  const ownerPart = owner ? ` by ${owner}` : ''
  const datePart = date ? ` ${date}` : ''
  return `${setPart}${fmt}${ownerPart}${datePart}`.trim()
}
