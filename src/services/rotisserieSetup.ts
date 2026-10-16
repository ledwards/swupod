/**
 * Rotisserie setup (plan B3): what the setup step chooses, and the body it
 * sends to POST /api/formats/rotisserie. Ranges are the ones the lobby's
 * update-settings action enforces.
 */

export type RotisserieDraftMode = 'fixed' | 'exhausted'

export interface RotisserieSetupState {
  setCodes: string[]
  /** Practice Solo: every other seat is a bot and the draft starts at once. */
  solo: boolean
  /** Seats at the table, you included (max players for a friends table). */
  players: number
  draftMode: RotisserieDraftMode
  picksPerPlayer: number
  timerEnabled: boolean
  pickTimerSeconds: number
}

export const ROTISSERIE_LIMITS = {
  players: [2, 16],
  soloPlayers: [2, 8],
  picksPerPlayer: [1, 500],
  pickTimerSeconds: [10, 600],
} as const

export const ROTISSERIE_DEFAULTS: Omit<RotisserieSetupState, 'setCodes'> = {
  solo: false,
  players: 8,
  draftMode: 'fixed',
  picksPerPlayer: 42,
  timerEnabled: false,
  pickTimerSeconds: 120,
}

const clamp = (n: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : lo)))

export const rotisserieSeats = (s: RotisserieSetupState): number =>
  clamp(s.players, s.solo ? ROTISSERIE_LIMITS.soloPlayers : ROTISSERIE_LIMITS.players)

export function rotisserieCreateBody(s: RotisserieSetupState) {
  return {
    setCodes: s.setCodes,
    maxPlayers: rotisserieSeats(s),
    draftMode: s.draftMode,
    picksPerPlayer: clamp(s.picksPerPlayer, ROTISSERIE_LIMITS.picksPerPlayer),
    timerEnabled: s.solo ? false : s.timerEnabled,
    pickTimerSeconds: clamp(s.pickTimerSeconds, ROTISSERIE_LIMITS.pickTimerSeconds),
  }
}

/** Bots to seat before a Practice Solo draft starts. */
export const rotisserieBotCount = (s: RotisserieSetupState): number => s.solo ? rotisserieSeats(s) - 1 : 0

interface PoolCard { type?: string; rarity?: string; variantType?: string; isToken?: boolean; isLeader?: boolean; isBase?: boolean }

// Same rule as generateCardPool in app/api/formats/rotisserie/[shareId]/route.ts.
const SETS_WITH_S_CARDS = new Set(['TWI', 'JTL', 'LOF', 'SEC', 'LAW'])

/** How many cards a set puts in the face-up pool. */
export function rotisseriePoolSize(setCode: string, cards: PoolCard[]): number {
  const includeS = SETS_WITH_S_CARDS.has(setCode)
  return cards.filter(c => {
    if (c.isToken || c.type === 'Token') return false
    if (c.variantType && c.variantType !== 'Normal') return false
    if (c.rarity === 'Special' || c.rarity === 'S') return includeS
    if (c.type === 'Base' || c.isBase) return c.rarity !== 'Common'
    return true
  }).length
}

/** Fixed picks the pool can't cover (0 when it can, or in Entire Pool mode). */
export function rotisserieShortfall(s: RotisserieSetupState, poolSize: number): number {
  if (s.draftMode === 'exhausted') return 0
  return Math.max(0, rotisserieSeats(s) * clamp(s.picksPerPlayer, ROTISSERIE_LIMITS.picksPerPlayer) - poolSize)
}

/** A setup restored from storage, with anything malformed replaced by the default. */
export function normalizeRotisserieSetup(raw: unknown): RotisserieSetupState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (v: unknown, d: number) => typeof v === 'number' && Number.isFinite(v) ? v : d
  const bool = (v: unknown, d: boolean) => typeof v === 'boolean' ? v : d
  return {
    setCodes: Array.isArray(r['setCodes']) ? r['setCodes'].filter((c): c is string => typeof c === 'string') : [],
    solo: bool(r['solo'], ROTISSERIE_DEFAULTS.solo),
    players: num(r['players'], ROTISSERIE_DEFAULTS.players),
    draftMode: r['draftMode'] === 'exhausted' ? 'exhausted' : 'fixed',
    picksPerPlayer: num(r['picksPerPlayer'], ROTISSERIE_DEFAULTS.picksPerPlayer),
    timerEnabled: bool(r['timerEnabled'], ROTISSERIE_DEFAULTS.timerEnabled),
    pickTimerSeconds: num(r['pickTimerSeconds'], ROTISSERIE_DEFAULTS.pickTimerSeconds),
  }
}
