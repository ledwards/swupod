// @ts-nocheck
// Script to fetch all cards from swuapi.com API and populate cards.json
// Automatically runs post-processing to apply fixes

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SWUAPI_URL = process.env.SWUAPI_URL || 'https://api.swuapi.com'
const SWUAPI_API_KEY = process.env.SWUAPI_API_KEY || ''
const SETS = [
  { code: 'SOR', name: 'Spark of Rebellion' },
  { code: 'SHD', name: 'Shadows of the Galaxy' },
  { code: 'TWI', name: 'Twilight of the Republic' },
  { code: 'JTL', name: 'Jump to Lightspeed' },
  { code: 'LOF', name: 'Legends of the Force' },
  { code: 'SEC', name: 'Secrets of Power' },
  { code: 'LAW', name: 'A Lawless Time' },
]

// Set codes we want to include
const VALID_SET_CODES = new Set(SETS.map(s => s.code))

const MAX_PAGES = 200

interface ApiCard {
  uuid: string
  collector_number: string
  set_code: string
  card_number: string
  name: string
  subtitle?: string
  rarity: string
  type: string
  aspects?: string[]
  traits?: string[]
  arena?: string | string[]
  cost?: number
  power?: number
  hp?: number
  text?: string
  back_text?: string
  epic_action?: string
  keywords?: string[]
  artist?: string
  is_unique?: boolean
  variant_type?: string
  is_leader?: boolean
  is_base?: boolean
  front_image_url?: string
  back_image_url?: string
}

interface TransformedCard {
  id: string
  cardId: string
  name: string
  subtitle: string | null
  set: string
  number: string
  rarity: string
  type: string
  aspects: string[]
  traits: string[]
  arenas: string[]
  cost: number | null
  power: number | null
  hp: number | null
  frontText: string | null
  backText: string | null
  epicAction: string | null
  keywords: string[]
  artist: string | null
  unique: boolean
  doubleSided: boolean
  variantType: string
  marketPrice: null
  lowPrice: null
  isLeader: boolean
  isBase: boolean
  isFoil: boolean
  isHyperspace: boolean
  isShowcase: boolean
  isPrestige: boolean
  prestigeTier: string | null
  imageUrl: string | null
  backImageUrl: string | null
}

/**
 * Fetch all records from a paginated /export/:entity endpoint.
 * Follows cursor pagination until has_more is false.
 */
async function fetchAll(entity: string): Promise<ApiCard[]> {
  const results: ApiCard[] = []
  let cursor: string | null = null
  let page = 0

  console.log(`Fetching all ${entity} from ${SWUAPI_URL}/export/${entity}...`)

  do {
    if (page >= MAX_PAGES) {
      throw new Error(`fetchAll('${entity}') exceeded MAX_PAGES (${MAX_PAGES}). API may be returning a repeated cursor.`)
    }

    const url = cursor
      ? `${SWUAPI_URL}/export/${entity}?cursor=${cursor}`
      : `${SWUAPI_URL}/export/${entity}`

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${SWUAPI_API_KEY}` },
    })

    if (!response.ok) {
      if (response.status === 401) {
        console.error('→ Check that SWUAPI_API_KEY is set correctly.')
      }
      throw new Error(`Error fetching ${entity} (page ${page}): HTTP ${response.status}`)
    }

    const data = await response.json() as { data: ApiCard[]; total: number; has_more: boolean; next_cursor: string | null }
    results.push(...data.data)
    cursor = data.has_more ? data.next_cursor : null
    page++
    console.log(`  Page ${page}: +${data.data.length} cards (total so far: ${results.length} / ${data.total})`)
  } while (cursor)

  return results
}

/**
 * Transform API card data to our card schema
 */
function transformCard(apiCard: ApiCard): TransformedCard {
  const setCode = apiCard.set_code || ''
  const cardNumber = apiCard.card_number || ''
  // Use uuid as unique identifier (collector_number is NOT unique across variants)
  const id = apiCard.uuid
  const cardId = apiCard.collector_number.replace('_', '-')

  // Normalize arena to array (API uses singular 'arena')
  let arenas: string[] = []
  if (apiCard.arena) {
    arenas = Array.isArray(apiCard.arena) ? apiCard.arena : [apiCard.arena]
  }

  // Normalize variantType - map API values to our expected values
  let variantType = apiCard.variant_type || 'Normal'
  // Map swuapi.com variant types to our expected values
  const variantTypeMap: Record<string, string> = {
    'Standard': 'Normal',
    'Standard Foil': 'Foil',
    // 'Hyperspace' stays as is
    // 'Hyperspace Foil' stays as is
    // 'Showcase' stays as is
  }
  if (variantTypeMap[variantType]) {
    variantType = variantTypeMap[variantType]
  }

  // Determine isFoil based on variantType (not the hasFoil flag which indicates if foil exists)
  const isFoil = variantType === 'Foil' || variantType === 'Hyperspace Foil' ||
    variantType === 'Foil Prestige' || variantType === 'Serialized Prestige'

  // Determine prestige fields
  const isPrestige = variantType === 'Standard Prestige' || variantType === 'Foil Prestige' || variantType === 'Serialized Prestige'
  const prestigeTierMap: Record<string, string> = {
    'Standard Prestige': 'tier1',
    'Foil Prestige': 'tier2',
    'Serialized Prestige': 'serialized',
  }
  const prestigeTier = prestigeTierMap[variantType] || null

  return {
    id,
    cardId,
    name: apiCard.name || '',
    subtitle: apiCard.subtitle || null,
    set: setCode,
    number: cardNumber,
    rarity: apiCard.rarity || 'Common',
    type: apiCard.type || '',
    aspects: apiCard.aspects || [],
    traits: apiCard.traits || [],
    arenas,
    cost: apiCard.cost !== null && apiCard.cost !== undefined ? parseInt(String(apiCard.cost)) : null,
    power: apiCard.power !== null && apiCard.power !== undefined ? parseInt(String(apiCard.power)) : null,
    hp: apiCard.hp !== null && apiCard.hp !== undefined ? parseInt(String(apiCard.hp)) : null,
    frontText: apiCard.text || null,
    backText: apiCard.back_text || null,
    epicAction: apiCard.epic_action || null,
    keywords: apiCard.keywords || [],
    artist: apiCard.artist || null,
    unique: apiCard.is_unique || false,
    doubleSided: !!(apiCard.back_image_url),
    variantType,
    marketPrice: null, // Not available in swuapi.com
    lowPrice: null, // Not available in swuapi.com
    isLeader: apiCard.is_leader || false,
    isBase: apiCard.is_base || false,
    isFoil,
    isHyperspace: variantType === 'Hyperspace' || variantType === 'Hyperspace Foil',
    isShowcase: variantType === 'Showcase',
    isPrestige,
    prestigeTier,
    imageUrl: apiCard.front_image_url || null,
    backImageUrl: apiCard.back_image_url || null,
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('Starting card data fetch from swuapi.com API...')
  console.log(`Sets to include: ${SETS.map(s => s.code).join(', ')}`)

  const apiCards = await fetchAll('cards')

  if (apiCards.length === 0) {
    console.error('No cards fetched from API!')
    process.exit(1)
  }

  console.log(`\n✓ Fetched ${apiCards.length} total cards from API`)

  // Filter to only our desired sets and transform
  const allCards = apiCards
    .filter(card => VALID_SET_CODES.has(card.set_code))
    .map(card => transformCard(card))

  console.log(`\n✓ Total cards fetched: ${allCards.length}`)

  // Prepare output data
  const output = {
    cards: allCards,
    metadata: {
      version: '1.0.0',
      lastUpdated: new Date().toISOString().split('T')[0],
      description: 'Star Wars: Unlimited card database fetched from swuapi.com API',
      totalCards: allCards.length,
      sets: SETS.map(s => ({
        code: s.code,
        name: s.name,
        cardCount: allCards.filter(c => c.set === s.code).length,
      })),
    },
  }

  // Write raw data (before post-processing)
  const rawDataPath = path.join(__dirname, '../src/data/cards.raw.json')
  fs.writeFileSync(rawDataPath, JSON.stringify(output, null, 2))
  console.log(`\n✓ Raw data written to ${rawDataPath}`)

  // Write to cards.json (will be overwritten by post-processing)
  const outputPath = path.join(__dirname, '../src/data/cards.json')
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
  console.log(`✓ Cards written to ${outputPath}`)

  console.log(`\nCard counts by set:`)
  SETS.forEach(set => {
    const count = allCards.filter(c => c.set === set.code).length
    console.log(`  ${set.code}: ${count} cards`)
  })

  // Run post-processing
  console.log('\n' + '='.repeat(50))
  console.log('Running post-processing...')
  console.log('='.repeat(50) + '\n')

  try {
    execSync('npx tsx scripts/postProcessCards.ts', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    })
  } catch (error) {
    console.error('Error running post-processing:', (error as Error).message)
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
