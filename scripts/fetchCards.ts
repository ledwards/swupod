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

interface ApiCard {
  uuid: string
  externalId: number
  collectorNumber: string
  externalUid: string
  setCode: string
  cardNumber: string
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
  backText?: string
  epicAction?: string
  keywords?: string[]
  artist?: string
  isUnique?: boolean
  variantType?: string
  isLeader?: boolean
  isBase?: boolean
  frontImageUrl?: string
  backImageUrl?: string
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
 * Fetch all cards from the export endpoint
 */
async function fetchAllCardsFromAPI(): Promise<ApiCard[]> {
  console.log(`Fetching all cards from ${SWUAPI_URL}...`)

  try {
    const response = await fetch(`${SWUAPI_URL}/export/all`, {
      headers: { 'Authorization': `Bearer ${SWUAPI_API_KEY}` },
    })
    if (response.ok) {
      const data = await response.json()
      // API returns { cards: [...] }
      return data.cards || []
    } else {
      console.error(`Error fetching cards: ${response.status}`)
      return []
    }
  } catch (error) {
    console.error(`Error fetching cards:`, (error as Error).message)
    return []
  }
}

/**
 * Transform API card data to our card schema
 */
function transformCard(apiCard: ApiCard): TransformedCard {
  const setCode = apiCard.setCode || ''
  const cardNumber = apiCard.cardNumber || ''
  // Use externalId as unique identifier (collector_number is NOT unique across variants)
  const id = String(apiCard.externalId)
  const cardId = apiCard.collectorNumber.replace('_', '-')

  // Normalize arena to array (API uses singular 'arena')
  let arenas: string[] = []
  if (apiCard.arena) {
    arenas = Array.isArray(apiCard.arena) ? apiCard.arena : [apiCard.arena]
  }

  // Normalize variantType - map API values to our expected values
  let variantType = apiCard.variantType || 'Normal'
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
    backText: apiCard.backText || null,
    epicAction: apiCard.epicAction || null,
    keywords: apiCard.keywords || [],
    artist: apiCard.artist || null,
    unique: apiCard.isUnique || false,
    doubleSided: !!(apiCard.backImageUrl),
    variantType,
    marketPrice: null, // Not available in swuapi.com
    lowPrice: null, // Not available in swuapi.com
    isLeader: apiCard.isLeader || false,
    isBase: apiCard.isBase || false,
    isFoil,
    isHyperspace: variantType === 'Hyperspace' || variantType === 'Hyperspace Foil',
    isShowcase: variantType === 'Showcase',
    isPrestige,
    prestigeTier,
    imageUrl: apiCard.frontImageUrl || null,
    backImageUrl: apiCard.backImageUrl || null,
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('Starting card data fetch from swuapi.com API...')
  console.log(`Sets to include: ${SETS.map(s => s.code).join(', ')}`)

  const apiCards = await fetchAllCardsFromAPI()

  if (apiCards.length === 0) {
    console.error('No cards fetched from API!')
    process.exit(1)
  }

  console.log(`\n✓ Fetched ${apiCards.length} total cards from API`)

  // Filter to only our desired sets and transform
  const allCards = apiCards
    .filter(card => VALID_SET_CODES.has(card.setCode))
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

main().catch(console.error)
