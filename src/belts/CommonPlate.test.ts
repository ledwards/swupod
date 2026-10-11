import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CommonPlate } from './CommonPlate'

const card = (name: string) => ({ name, subtitle: '' }) as never

test('packAgo returns the four cards each lane printed `lag` packs before the newest', () => {
  const plate = new CommonPlate(4 * 5)
  for (let p = 0; p < 4; p++) for (let i = 0; i < 4; i++) {
    plate.record('A', card(`A${p}-${i}`))
    plate.record('B', card(`B${p}-${i}`))
  }
  const names = plate.packAgo(2).map(c => (c as { name: string }).name).sort()
  assert.deepEqual(names, ['A1-0', 'A1-1', 'A1-2', 'A1-3', 'B1-0', 'B1-1', 'B1-2', 'B1-3'])
})

test('no history that far back gives nothing (a fresh box prints independently)', () => {
  const plate = new CommonPlate(4 * 17)
  for (let i = 0; i < 8; i++) plate.record('A', card(`A${i}`))
  assert.deepEqual(plate.packAgo(15), [])
})
