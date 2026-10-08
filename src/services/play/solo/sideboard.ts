/** Shared UI/server rules. Card availability always comes from the server's pool. */
export type SideboardCard = {
  id: string; engineId: string; name: string; type: string; count: number; supported: boolean
  imageUrl?: string; subtitle?: string; cost?: number | null
}
export type SideboardSelection = { leader: string; base: string; deck: Record<string, number> }
export function sideboardMinimum(base?: SideboardCard) {
  return base?.engineId === 'JTL_024' ? 40 : base?.engineId === 'JTL_025' ? 25 : 30
}
export function sideboardErrors(selection: SideboardSelection, cards: SideboardCard[]): string[] {
  const byId = new Map(cards.map(c => [c.id, c])), errors: string[] = []
  for (const [key, type] of [['leader', 'Leader'], ['base', 'Base']] as const) {
    const card = byId.get(selection[key])
    if (!card || card.type !== type || !card.count) errors.push(`Choose a ${key} from your pool.`)
    else if (!card.supported) errors.push(`${card.name} is not supported for AI play yet.`)
  }
  let total = 0
  for (const [id, count] of Object.entries(selection.deck)) {
    const card = byId.get(id)
    if (!Number.isSafeInteger(count) || count < 0) { errors.push('Card quantities must be whole, nonnegative numbers.'); continue }
    if (!count) continue
    if (!card || !['Unit', 'Event', 'Upgrade'].includes(card.type) || count > card.count) {
      errors.push('Use only cards and copies from this pool.'); continue
    }
    if (!card.supported) errors.push(`${card.name} is not supported for AI play yet.`)
    total += count
  }
  const minimum = sideboardMinimum(byId.get(selection.base))
  if (total < minimum) errors.push(`Your deck needs at least ${minimum} cards (${total} selected).`)
  if (total > 100) errors.push('AI play supports up to 100 main-deck cards.')
  return [...new Set(errors)]
}
export function selectionFromDeck(deck: {leader: string; base: string; deck: readonly {id: string; count: number}[]}, cards: SideboardCard[]): SideboardSelection {
  const ids = new Map(cards.map(c => [c.engineId, c.id]))
  return {leader: ids.get(deck.leader) ?? '', base: ids.get(deck.base) ?? '',
    deck: Object.fromEntries(deck.deck.map(c => [ids.get(c.id) ?? c.id, c.count]))}
}
export type SideboardData = {
  locked?: boolean; runId: string; gameId: string; gameNumber: number; poolShareId: string; returnUrl: string
  cards: SideboardCard[]; selection: SideboardSelection
  builds: {shareId: string; name: string; selection: SideboardSelection}[]
}
