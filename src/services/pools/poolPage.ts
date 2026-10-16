/**
 * The pool page's pure rules: how a pool's cards split into packs, and which
 * of its builds show, in what order, and who may delete them. The same rules as
 * the legacy pool pages (draft_pool, SealedPoolClient, PoolBuilds).
 */

export interface PoolCard {
  id?: string
  name?: string
  type?: string
  isLeader?: boolean
  [key: string]: unknown
}
export interface PoolPack { name?: string; cards: PoolCard[] }

const DRAFT_ROUND_SIZE = 14
const DRAFT_ROUNDS = 3

/** Draft pools: the leaders, then Round 1–3 of 14. Sealed pools: their packs as saved (Pack 1…N). */
export function poolPacks(pool: { poolType?: string; packs?: PoolPack[] | null; cards?: PoolCard[] | null }): Array<{ name: string; cards: PoolCard[] }> {
  if (pool.poolType === 'draft') {
    const all = pool.packs?.length ? pool.packs.flatMap(p => p.cards || []) : pool.cards ?? []
    const isLeader = (c: PoolCard) => Boolean(c.isLeader) || c.type === 'Leader'
    const rest = all.filter(c => !isLeader(c))
    const out = [{ name: 'Leaders', cards: all.filter(isLeader) }]
    for (let r = 0; r < DRAFT_ROUNDS; r++) out.push({ name: `Round ${r + 1}`, cards: rest.slice(r * DRAFT_ROUND_SIZE, (r + 1) * DRAFT_ROUND_SIZE) })
    return out.filter(p => p.cards.length > 0)
  }
  const packs = pool.packs?.length ? pool.packs : pool.cards?.length ? [{ cards: pool.cards }] : []
  return packs.map((p, i) => ({ name: p.name || `Pack ${i + 1}`, cards: p.cards || [] }))
}

export interface PoolBuild {
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

/** A build counts as a deck once it has a leader or any deck cards. */
export const poolDecks = (builds: PoolBuild[]) => builds.filter(b => Boolean(b.leaderName) || b.deckCardCount > 0)

/** All Builds: the original first, then each builder by their newest build, anonymous builders last. */
export function groupBuildsByAuthor(builds: PoolBuild[]): Array<{ key: string; label: string; builds: PoolBuild[] }> {
  const original = builds.find(b => b.isOriginal) ?? null
  const groups = new Map<string, { key: string; label: string; builds: PoolBuild[]; latest: string }>()
  for (const b of builds.filter(b => !b.isOriginal)) {
    const key = b.builderUserId || `anon:${b.builderName || 'Anonymous'}`
    const ts = b.createdAt || ''
    const g = groups.get(key)
    if (g) { g.builds.push(b); if (ts > g.latest) g.latest = ts } else groups.set(key, { key, label: b.builderName || 'Anonymous', builds: [b], latest: ts })
  }
  const sorted = [...groups.values()].sort((a, b) => {
    const aAnon = a.key.startsWith('anon:'), bAnon = b.key.startsWith('anon:')
    if (aAnon !== bAnon) return aAnon ? 1 : -1
    return a.latest === b.latest ? 0 : a.latest < b.latest ? 1 : -1
  })
  const out = sorted.map(({ key, label, builds }) => ({ key, label, builds }))
  if (original) out.unshift({ key: 'original', label: original.builderName ? `Original (${original.builderName})` : 'Original', builds: [original] })
  return out
}

/** Deleting your original promotes your oldest other build on the pool (null: the pool goes with it). */
export function reparentTarget(builds: PoolBuild[], target: PoolBuild, userId: string | null): PoolBuild | null {
  if (!target.isOriginal || !userId) return null
  return builds.filter(b => !b.isOriginal && b.builderUserId === userId)
    .sort((a, b) => ((a.createdAt || '') < (b.createdAt || '') ? -1 : 1))[0] ?? null
}

/** Your own deck anywhere, or any deck on a pool you own. */
export const canDeleteBuild = (b: PoolBuild, userId: string | null, ownsPool: boolean) =>
  Boolean(userId && b.builderUserId && b.builderUserId === userId) || ownsPool

export const buildHref = (rootShareId: string, b: PoolBuild) =>
  b.isOriginal ? `/pools/${rootShareId}/deck` : `/pools/${rootShareId}/deck/${b.shareId}`
