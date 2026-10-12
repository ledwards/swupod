/**
 * Pure shaping for the Draft Log and its Pod Review: pick rounds, a built
 * deck split out of deck_builder_state, its cost curve, and one seat's matches.
 */
import type { HubView } from '../pods/hubTypes'

export interface LogPick {
  type: 'leader' | 'card'
  packNumber: number
  pickInPack: number
  visibleCards: Array<{ instanceId: string; id: string; [key: string]: unknown }>
  pickedInstanceId: string | null
}

export type RoundKey = 'leaders' | 'pack1' | 'pack2' | 'pack3'
export interface LogRound { key: RoundKey; label: string; picks: LogPick[] }

/** The draft's rounds in order, leaving out any with no picks. */
export function logRounds(picks: LogPick[]): LogRound[] {
  const rounds: LogRound[] = [
    { key: 'leaders', label: 'Leaders', picks: picks.filter(p => p.type === 'leader') },
    { key: 'pack1', label: 'Pack 1', picks: picks.filter(p => p.type === 'card' && p.packNumber === 1) },
    { key: 'pack2', label: 'Pack 2', picks: picks.filter(p => p.type === 'card' && p.packNumber === 2) },
    { key: 'pack3', label: 'Pack 3', picks: picks.filter(p => p.type === 'card' && p.packNumber === 3) },
  ]
  return rounds.filter(r => r.picks.length > 0)
}

interface CardLike { cost?: number | null; isLeader?: boolean; isBase?: boolean; type?: string; [key: string]: unknown }
interface CardPosition { card?: CardLike; section?: string; visible?: boolean; enabled?: boolean }
interface DeckState { cardPositions?: Record<string, CardPosition>; activeLeader?: string; activeBase?: string }

export interface SplitDeck { leader: CardLike | null; base: CardLike | null; deck: CardLike[]; sideboard: CardLike[] }

/** The active leader and base, the main deck (by cost) and the sideboard of a saved deck builder state. */
export function splitDeckState(state: unknown): SplitDeck {
  const out: SplitDeck = { leader: null, base: null, deck: [], sideboard: [] }
  const s = state as DeckState | null
  if (!s || typeof s !== 'object' || !s.cardPositions) return out
  for (const [id, pos] of Object.entries(s.cardPositions)) {
    const card = pos.card
    if (!card) continue
    if ((card.isLeader || card.type === 'Leader') && id === s.activeLeader) out.leader = card
    else if ((card.isBase || card.type === 'Base') && id === s.activeBase) out.base = card
    // Same membership rule as the decklist (buildDeckView): only visible positions count.
    else if (pos.section === 'deck' && pos.visible && pos.enabled !== false) out.deck.push(card)
    else if (pos.section === 'sideboard' && pos.visible) out.sideboard.push(card)
  }
  out.deck.sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))
  return out
}

export const CURVE_BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7+'] as const

/** Cards at each cost, 7 and up in the last bucket. */
export function costCurve(cards: CardLike[]): number[] {
  const counts = CURVE_BUCKETS.map(() => 0)
  for (const card of cards) {
    const bucket = Math.min(Math.max(0, Math.floor(card.cost ?? 0)), CURVE_BUCKETS.length - 1)
    counts[bucket] = (counts[bucket] ?? 0) + 1
  }
  return counts
}

export interface SeatMatch {
  key: string
  label: string
  opponent: string
  score: string
  result: 'win' | 'loss' | 'draw' | 'playing' | 'bye'
  games: Array<'W' | 'L' | 'D'>
}

/** One player's tournament matches, oldest first, scored from their side. */
export function seatMatches(view: HubView | null, playerId: string | null): SeatMatch[] {
  if (!view?.tournament || !playerId) return []
  const out: SeatMatch[] = []
  for (const round of view.tournament.rounds) {
    const m = round.matches.find(x => x.p1.id === playerId || x.p2?.id === playerId)
    if (!m) continue
    const side = m.p1.id === playerId ? 'player1' : 'player2'
    const mine = side === 'player1' ? 0 : 1
    const opponent = (side === 'player1' ? m.p2?.name : m.p1.name) ?? 'Bye'
    const score = m.status === 'bye' ? '' : `${m.score[mine]}–${m.score[1 - mine]}`
    const result: SeatMatch['result'] = m.status === 'bye' ? 'bye'
      : m.status === 'playing' || !m.winner ? 'playing'
      : m.winner === 'draw' ? 'draw'
      : m.winner === side ? 'win' : 'loss'
    const games = m.games.map(g => (g === 'draw' ? 'D' : g === side ? 'W' : 'L') as 'W' | 'L' | 'D')
    out.push({ key: round.key, label: round.label, opponent, score, result, games })
  }
  return out
}

/** Standings record ("2–1") by player id. */
export function recordsById(view: HubView | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of view?.tournament?.standings ?? []) out[s.id] = s.record
  return out
}
