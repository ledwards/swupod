// Resolve the same limited archetype names as saved builds, including deck-dependent splashes.
const cache = new Map<string, {expires: number; value: Promise<string | null>}>()
export function soloArchetypeName(leaderId: string, baseId: string, deckIds: string[]): Promise<string | null> {
  const cards = [...new Set(deckIds)].sort()
  const key = JSON.stringify([leaderId,baseId,cards])
  const existing = cache.get(key)
  if (existing && existing.expires > Date.now()) return existing.value
  const value = (async () => {
    try {
      const url = new URL('/archetypes/resolve',process.env.SWUAPI_URL || 'https://api.swuapi.com')
      url.search = new URLSearchParams({leader_card_uuid:leaderId,base_card_uuid:baseId,format:'Limited',deck_card_uuids:cards.join(',')}).toString()
      const response = await fetch(url,{signal:AbortSignal.timeout(3000)})
      if (!response.ok) return null
      const data = await response.json()
      return typeof data.nickname === 'string' && data.nickname.trim() ? data.nickname : null
    } catch { return null }
  })()
  if (cache.size >= 256) cache.delete(cache.keys().next().value!)
  cache.set(key,{expires:Date.now()+60_000,value})
  return value
}
