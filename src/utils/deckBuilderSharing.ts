import { packCountNameSuffix } from './sealedFormat'

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

export interface PlayDestinationOptions {
  /** `card_pools.pool_type` — 'draft' for draft pools, 'sealed' for sealed pools. */
  poolType?: string | null
  /** Share id of the pod this pool came from, or null for a solo pool. */
  podShareId?: string | null
  /** True when the pod is a Competitive (Swiss Practice) pod. */
  competitive?: boolean
  /** Share id of the pool itself. */
  shareId?: string | null
}

/**
 * Where "Ready to Play" sends the player.
 *
 * SPEC:
 * - Competitive pods — draft AND sealed — go to `/pool/:shareId/deck/play`.
 *   That is the ONLY page that renders the Swiss Practice panel (pairings,
 *   "Start Round 1", result reporting), so both formats must land there.
 * - Casual draft pod  → `/draft/:podShareId/pod`
 * - Casual sealed pod → `/sealed/:podShareId/pod`
 * - No pod at all (solo pool) → `/pool/:shareId/deck/play`
 *
 * Returns null when there is nothing to navigate to (no ids at all).
 */
export function resolvePlayDestination({
  poolType = null,
  podShareId = null,
  competitive = false,
  shareId = null,
}: PlayDestinationOptions): string | null {
  // Competitive is decided by the POD, not the pool format. Checking poolType
  // first is what stranded Competitive Sealed on the casual sealed hub.
  if (competitive && shareId) {
    return `/pool/${shareId}/deck/play`
  }
  if (podShareId) {
    return poolType === 'draft'
      ? `/draft/${podShareId}/pod`
      : `/sealed/${podShareId}/pod`
  }
  return shareId ? `/pool/${shareId}/deck/play` : null
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

// === Find existing build (replaces server-side dedup) ==================
//
// We don't dedup on the server — multiple builds per (user, parent) are by design.
// But the auto-build-on-Play path should still be idempotent: a non-owner who
// hits "Ready to Play" repeatedly shouldn't accumulate one new build per click.
//
// Solution: before creating a build, ask `/api/pools/:rootShareId/builds`,
// look for any non-original build owned by the current user, and reuse it
// (most recent first). The + chip explicitly does NOT call this — it always
// creates new.

export interface BuildEntry {
  shareId: string
  builderUserId?: string | null
  isOriginal?: boolean
  createdAt?: string | null
}

/**
 * Pure: given a builds list and a user id, return the most-recently-created
 * non-original build owned by that user. Returns null if none.
 *
 * Skips:
 *   - the root entry (`isOriginal: true`) — that's the parent pool, not a build
 *   - entries belonging to other users
 *   - anonymous entries (builderUserId is null) when currentUserId is set
 *
 * Returns null when currentUserId is null/empty (anonymous users can't have a
 * known existing build).
 */
export function findUserBuild<T extends BuildEntry>(
  builds: T[] | null | undefined,
  currentUserId: string | null | undefined,
): T | null {
  if (!builds || !builds.length) return null
  if (!currentUserId) return null
  const mine = builds.filter(b => !b.isOriginal && b.builderUserId === currentUserId)
  if (!mine.length) return null
  // Most recent first. createdAt is ISO; lexical comparison is fine.
  mine.sort((a, b) => {
    const ta = a.createdAt || ''
    const tb = b.createdAt || ''
    if (ta === tb) return 0
    return ta < tb ? 1 : -1
  })
  return mine[0] ?? null
}

// Fetches the builds list and returns the user's existing build if any.
// Returns null on network error too — caller should fall back to creating new.
export async function fetchUserBuild(
  rootShareId: string,
  currentUserId: string | null | undefined,
): Promise<BuildEntry | null> {
  if (!rootShareId || !currentUserId) return null
  try {
    const res = await fetch(`/api/pools/${rootShareId}/builds`, { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    const builds: BuildEntry[] = data?.data?.builds || []
    return findUserBuild(builds, currentUserId)
  } catch {
    return null
  }
}

// === Default-name generation ===========================================
//
// Pools and builds get an auto-generated name when they are created.
// `isDefaultName` (stored on `deck_builder_state`) tracks whether the
// current name is still the auto-default (true) or has been edited by the
// user (false). Auto-rename only fires while `isDefaultName === true`.

import { formatSetCodeLabel } from './setCodeLabel'

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

// "{owner}'s {SET} {Sealed|Draft} Pool {(N-pack)} {MM.DD.YY}"
// e.g. "terronk's LAW Sealed Pool (8-pack) 05.28.26"
export interface DefaultPoolNameInputs {
  ownerName?: string | null
  setCode?: string | null
  poolType?: PoolFormat | null
  createdAt?: Date | string | null
  /** Sealed packs opened for this pool — 6-pack and 8-pack sealed are
   *  different formats. Omitted when unknown (see utils/sealedFormat). */
  packCount?: number | null
}

export function getDefaultPoolName({ ownerName, setCode, poolType, createdAt, packCount }: DefaultPoolNameInputs): string {
  const owner = ownerName?.trim()
  // Multi-pack formats store every pack's code; show the distinct sets (Event Packs as PROMO).
  const set = formatSetCodeLabel(setCode)
  const fmt = formatLabel(poolType)
  const date = formatPoolDate(createdAt)
  const ownerPart = owner ? `${owner}'s ` : ''
  const setPart = set ? `${set} ` : ''
  const packPart = packCountNameSuffix(poolType === 'draft' ? null : packCount)
  const datePart = date ? ` ${date}` : ''
  return `${ownerPart}${setPart}${fmt} Pool${packPart}${datePart}`.trim()
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
    // Multi-pack formats store every pack's code; show the distinct sets (Event Packs as PROMO).
  const set = formatSetCodeLabel(setCode)
    const fmt = formatLabel(poolType)
    const date = formatPoolDate(createdAt)
    const setPart = set ? ` (${set})` : ''
    const datePart = date ? ` ${date}` : ''
    return `${archetype}${setPart} ${fmt} Pool${datePart}`.trim()
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
  // Multi-pack formats store every pack's code; show the distinct sets (Event Packs as PROMO).
  const set = formatSetCodeLabel(setCode)
  const fmt = formatLabel(poolType)
  const date = formatPoolDate(createdAt)
  const owner = ownerName?.trim()
  const setPart = set ? `${set} ` : ''
  const ownerPart = owner ? ` by ${owner}` : ''
  const datePart = date ? ` ${date}` : ''
  return `${setPart}${fmt}${ownerPart}${datePart}`.trim()
}
