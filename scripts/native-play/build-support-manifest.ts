import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parse } from 'dotenv'
import { cardIdentityKey } from '../../src/utils/cardNormalization'

// Internal integration inventory, not a claim that every authored ability passed certification.
const args = process.argv.slice(2)
const value = (key: string) => { const at = args.indexOf(key); return at < 0 ? undefined : args[at + 1] }
const output = value('--output'), envFile = value('--env-file'), requestedSets = (value('--sets') ?? 'all').split(',')
if (!output || !envFile) throw new Error('Usage: --env-file PRIVATE_ENV --output FILE [--sets all|SOR,SHD] [--engine http://localhost:4321] [--reviewed-ids FILE]')
const env = parse(await readFile(envFile, 'utf8'))
const key = env.BAIZE_PVP_SERVICE_KEY
if (!key) throw new Error('Private environment is missing Baize credentials')
const engine = value('--engine') ?? 'http://localhost:4321'
const inventory = await fetch(`${engine}/v1/support`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000), redirect: 'error' })
if (!inventory.ok) throw new Error(`Support inventory unavailable (${inventory.status})`)
const support = await inventory.json()
if (support.protocolVersion !== 1 || !support.engineRevision || !Array.isArray(support.cards)) throw new Error('Unexpected engine support protocol')
const availableSets = [...new Set<string>(support.cards.map((card: {id: string}) => card.id.split('_')[0]!))].sort()
const sets = requestedSets.includes('all') ? availableSets : requestedSets
for (const set of sets) if (!availableSets.includes(set)) throw new Error(`Set ${set} is absent from the running engine inventory`)
const reviewedPath = value('--reviewed-ids')
const reviewed: Set<string> | null = reviewedPath ? new Set(JSON.parse(await readFile(reviewedPath, 'utf8'))) : null
const inventoryCards = new Map<string, { type: string }>(support.cards.map((c: any) => [c.id,c]))
const supported = new Map<string, { type: string }>(support.cards.filter((c: any) => c.authoring !== 'Unauthored' && ['Scripted','KeywordOnly','Vetted'].includes(c.authoring) && (!reviewed || reviewed.has(c.id))).map((c: any) => [c.id,c]))
const catalog = JSON.parse(await readFile(value('--catalog') ?? 'src/data/cards.json', 'utf8')).cards
// Constructed-only products do not live in the booster catalog. Preserve their
// physical print mappings through the same identity and rules checks below.
if (!value('--catalog')) {
 const supplemental = JSON.parse(await readFile('src/data/constructed-supplemental.json', 'utf8'))
 const ids = new Set(catalog.map((card:any) => card.id))
 for (const card of supplemental) {
  if (!card.ptpId || ids.has(card.ptpId)) continue
  if (!Object.hasOwn(card,'frontText') || !Array.isArray(card.aspects)) throw new Error(`Supplemental rules data is missing for ${card.id}; refresh the card catalog first`)
  catalog.push({...card,id:card.ptpId,number:card.id.split('_')[1],variantType:'Normal'})
  ids.add(card.ptpId)
 }
}
// Reprints can be absent from Baize's inventory because the original is its
// canonical game piece. Require identical rules data before using that identity.
// Parenthesized text on a card is reminder text, not rules, and the feed omits it on some reprint printings
// (LOF-428 Hyperspace Wampa reads "Overwhelm "): compare without it.
// Icon brackets and letter case are the feed's formatting too ("[Vigilance]"/"Vigilance", "TROOPER"/"Trooper").
const rulesText = (text: string | undefined) => (text ?? '').replace(/[−–](?=\d)/g, '-').replace(/\s*\([^()]*\)/g, '').replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
// Reprints reworded without changing their rules, checked by hand. Key: the reprint's standard printing; value: the
// engine card it plays as. Every other reprint must match the original's rules exactly.
const reviewedReprints: Record<string, string> = {
  LOF_060: 'TWI_058', // Padawan Starfighter: "a Force unit or upgrade" reads as TWI's "a Force unit or a Force upgrade"
}
const rulesKey = (card: any) => JSON.stringify([cardIdentityKey(card),card.cost,card.power,card.hp,
  [...(card.aspects??[])].sort(),[...(card.traits??[])].sort(),[...(card.arenas??[])].sort(),
  rulesText(card.frontText),rulesText(card.backText),card.epicAction??'',card.unique,card.doubleSided])
const normal = new Map<string, string>()
const normalRules = new Map<string,string>()
const ambiguousNormalRules = new Set<string>()
for (const card of catalog) {
  if (card.variantType !== 'Normal') continue
  const identity = `${card.set}:${cardIdentityKey(card)}`
  const id = `${card.set}_${String(card.number).padStart(3, '0')}`
  if (normalRules.has(identity) && normalRules.get(identity) !== rulesKey(card)) ambiguousNormalRules.add(identity)
  normalRules.set(identity,rulesKey(card))
  // Identical rules can have multiple normal printings in an intro product.
  // Exact normal cards retain their own printed ID; variants use a stable equivalent.
  normal.set(identity,[normal.get(identity),id].filter((id):id is string=>!!id).sort()[0]!)
}
const canonicalReprints = new Map<string,string[]>()
for(const card of catalog){
  if(card.variantType!=='Normal')continue
  const id=`${card.set}_${String(card.number).padStart(3,'0')}`
  if(inventoryCards.get(id)?.type!==card.type||!sets.includes(card.set))continue
  const key=rulesKey(card)
  canonicalReprints.set(key,[...(canonicalReprints.get(key)??[]),id].sort())
}
const cards: { ptpId: string; engineId: string; type: string; rarity: string }[] = []
for (const card of catalog) {
  // Canonical print identity includes set, name, type AND subtitle; ambiguity fails closed.
  const identity = `${card.set}:${cardIdentityKey(card)}`
  const printedId = card.variantType === 'Normal' ? `${card.set}_${String(card.number).padStart(3,'0')}` : ambiguousNormalRules.has(identity) ? undefined : normal.get(identity)
  const engineId = printedId&&inventoryCards.has(printedId)?printedId:canonicalReprints.get(rulesKey(card))?.[0]??(printedId?reviewedReprints[printedId]:undefined)
  if (!engineId) continue
  const entry = inventoryCards.get(engineId)
  if (!sets.includes(card.set) || !entry || entry.type !== card.type) continue
  cards.push({ ptpId: card.id,engineId,type: card.type,rarity: card.rarity })
}
if (!cards.length) throw new Error('No canonical card mappings matched the requested set inventory')
const supportedCardIds = [...supported.keys()].filter(id => sets.includes(id.split('_')[0]!)).sort()
const unrestrictedBaseIds = [...new Set(cards.filter(c => c.type === 'Base' && c.rarity === 'Common' && supported.has(c.engineId)).map(c => c.engineId))].sort()
const version = `${reviewed ? 'reviewed' : 'internal-authored-inventory'}-${createHash('sha256').update(JSON.stringify({cards,supportedCardIds,unrestrictedBaseIds,sets})).digest('hex').slice(0,16)}`
await writeFile(output, JSON.stringify({ engineRevision: support.engineRevision,compatibleRevisions: support.compatibleRevisions ?? [],version,supportedSets: sets,supportedCardIds,unrestrictedBaseIds,cards }, null, 2)+'\n', { mode: 0o600 })
console.log(JSON.stringify({ output,engineRevision:support.engineRevision,supportedSets:sets,canonicalCards:new Set(cards.map(c=>c.engineId)).size,printMappings:cards.length,reviewed:!!reviewed }))
