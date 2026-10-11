import { getCachedCardById, getCachedCards } from './cardCache'
import { normalizeCardId } from './cardNormalization'
import type { RawCard } from './cardData'

/**
 * The catalog card behind a built_decks entry. Built decks store the Normal
 * printing's export id ("HMW_003"); older rows may hold a catalog id. Leaders
 * and bases share collector numbers with other cards' Hyperspace printings, so
 * the kind picks the right one and the Normal printing wins.
 * Read the card cache first (initializeCardCache).
 */
export function cardForDeckId(id: unknown, kind?: 'leader' | 'base'): RawCard | null {
  if (typeof id !== 'string' || !id) return null
  const direct = getCachedCardById(id)
  if (direct) return direct
  const key = normalizeCardId(id)
  const set = key?.split('_')[0]
  if (!key || !set) return null
  const matches = getCachedCards(set).filter(c => c.cardId && normalizeCardId(c.cardId) === key)
  const fits = kind ? matches.filter(c => (kind === 'leader' ? c.isLeader || c.type === 'Leader' : c.isBase || c.type === 'Base')) : matches
  const pool = fits.length ? fits : matches
  return pool.find(c => c.variantType === 'Normal') ?? pool[0] ?? null
}
