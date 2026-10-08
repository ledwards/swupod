// Tests for the prebuild contract validator (megaplan F4).
// Run: npx tsx scripts/contractValidation.test.ts (also picked up by npm test).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadPinnedContract, validateRows, checkConsumedFields, JsonSchema } from './contractValidation'

const GOOD_ROW = {
  uuid: '019e8f15-fb74-7a29-b0ab-d7eac75b648f',
  strapi_id: 123,
  collector_number: 'LAW_001',
  set_uuid: '019e8f15-fb74-7a29-b0ab-d7eac75b6400',
  name: 'Test Card',
  subtitle: null,
  type: 'Ground Unit',
  aspects: ['Command'],
  traits: ['REBEL'],
  arena: 'Ground',
  cost: 3,
  power: 4,
  hp: 5,
  front_text: 'Some text',
  back_text: null,
  double_sided: false,
  rarity: 'Common',
  unique_flag: false,
  variant_type: 'Standard',
  front_image_url: 'https://example.com/a.png',
  back_image_url: null,
  card_uid: 'abc123',
  created_at: '2026-01-01T00:00:00.000Z',
  set_code: 'LAW',
  card_number: '001',
  keywords: [],
  artist: 'Someone',
  epic_action: null,
  is_leader: false,
  is_base: false,
  variant_of_uuid: null,
  updated_at: '2026-01-01T00:00:00.000Z',
  type2: 'unit',
  rules: null,
}

function exportCardsRow(): JsonSchema {
  const endpoint = loadPinnedContract().endpoints['GET /export/cards']
  assert.ok(endpoint?.row, 'pinned contract must declare GET /export/cards')
  return endpoint.row
}

test('pinned contract artifact loads and is v1', () => {
  const contract = loadPinnedContract()
  assert.equal(contract.contractVersion, 1)
  assert.ok(contract.endpoints['GET /export/cards'])
})

test('a conforming row passes', () => {
  assert.deepEqual(validateRows([GOOD_ROW], exportCardsRow()), [])
})

test('a missing required field fails (rename/drop canary)', () => {
  const { collector_number: _dropped, ...row } = GOOD_ROW
  const errors = validateRows([row], exportCardsRow())
  assert.ok(errors.some(e => e.includes('collector_number') && e.includes('missing')), errors.join('\n'))
})

test('a retyped field fails', () => {
  const errors = validateRows([{ ...GOOD_ROW, cost: '3' }], exportCardsRow())
  assert.ok(errors.some(e => e.includes('cost')), errors.join('\n'))
})

test('additive unknown fields pass (loose contract)', () => {
  assert.deepEqual(validateRows([{ ...GOOD_ROW, brand_new_field: 42 }], exportCardsRow()), [])
})

test('error reporting is capped', () => {
  const bad = Array.from({ length: 100 }, () => ({}))
  const errors = validateRows(bad, exportCardsRow(), 5)
  assert.ok(errors.length <= 6) // 5 + the "stopped" line
})

test('checkConsumedFields: declared fields pass, known gaps warn, new gaps fail', () => {
  const row = exportCardsRow()
  const result = checkConsumedFields(
    ['uuid', 'front_text', 'text', 'no_such_field'],
    row,
    { text: 'known /cards-only alias' },
  )
  assert.deepEqual(result.missing, ['no_such_field'])
  assert.equal(result.gapWarnings.length, 1)
  assert.ok(result.gapWarnings[0].includes('text'))
})
