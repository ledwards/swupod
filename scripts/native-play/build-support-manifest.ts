import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parse } from 'dotenv'
import { cardIdentityKey } from '../../src/utils/cardNormalization'

// Internal integration inventory, not a claim that every authored ability passed certification.
const args = process.argv.slice(2)
const value = (key: string) => { const at = args.indexOf(key); return at < 0 ? undefined : args[at + 1] }
const output = value('--output'), envFile = value('--env-file'), sets = value('--sets')?.split(',')
if (!output || !envFile || !sets?.length) throw new Error('Usage: --env-file PRIVATE_ENV --output FILE --sets SOR [--engine http://localhost:4321] [--reviewed-ids FILE]')
const env = parse(await readFile(envFile, 'utf8'))
const key = env.BAIZE_PVP_SERVICE_KEY
if (!key) throw new Error('Private environment is missing Baize credentials')
const engine = value('--engine') ?? 'http://localhost:4321'
const inventory = await fetch(`${engine}/v1/support`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000), redirect: 'error' })
if (!inventory.ok) throw new Error(`Support inventory unavailable (${inventory.status})`)
const support = await inventory.json()
if (support.protocolVersion !== 1 || !support.engineRevision || !Array.isArray(support.cards)) throw new Error('Unexpected engine support protocol')
const reviewedPath = value('--reviewed-ids')
const reviewed: Set<string> | null = reviewedPath ? new Set(JSON.parse(await readFile(reviewedPath, 'utf8'))) : null
const inventoryCards = new Map<string, { type: string }>(support.cards.map((c: any) => [c.id,c]))
const supported = new Map<string, { type: string }>(support.cards.filter((c: any) => c.authoring !== 'Unauthored' && ['Scripted','KeywordOnly','Vetted'].includes(c.authoring) && (!reviewed || reviewed.has(c.id))).map((c: any) => [c.id,c]))
const catalog = JSON.parse(await readFile(value('--catalog') ?? 'src/data/cards.json', 'utf8')).cards
const normal = new Map<string, string>()
for (const card of catalog) {
  if (card.variantType !== 'Normal') continue
  const identity = `${card.set}:${cardIdentityKey(card)}`
  const id = `${card.set}_${String(card.number).padStart(3, '0')}`
  if (normal.has(identity) && normal.get(identity) !== id) throw new Error('Ambiguous normal printing identity')
  normal.set(identity,id)
}
const cards: { ptpId: string; engineId: string; type: string; rarity: string }[] = []
for (const card of catalog) {
  // Canonical print identity includes set, name, type AND subtitle; ambiguity fails closed.
  const engineId = normal.get(`${card.set}:${cardIdentityKey(card)}`)
  if (!engineId) continue
  const entry = inventoryCards.get(engineId)
  if (!sets.includes(card.set) || !entry || entry.type !== card.type) continue
  cards.push({ ptpId: card.id,engineId,type: card.type,rarity: card.rarity })
}
if (!cards.length) throw new Error('No canonical card mappings matched the requested set inventory')
const supportedCardIds = [...supported.keys()].filter(id => sets.includes(id.split('_')[0]!)).sort()
const unrestrictedBaseIds = [...new Set(cards.filter(c => c.type === 'Base' && c.rarity === 'Common' && supported.has(c.engineId)).map(c => c.engineId))].sort()
const version = `${reviewed ? 'reviewed' : 'internal-authored-inventory'}-${createHash('sha256').update(JSON.stringify({cards,supportedCardIds,unrestrictedBaseIds,sets})).digest('hex').slice(0,16)}`
await writeFile(output, JSON.stringify({ engineRevision: support.engineRevision,version,supportedSets: sets,supportedCardIds,unrestrictedBaseIds,cards }, null, 2)+'\n', { mode: 0o600 })
console.log(JSON.stringify({ output,engineRevision:support.engineRevision,canonicalCards:new Set(cards.map(c=>c.engineId)).size,printMappings:cards.length,reviewed:!!reviewed }))
