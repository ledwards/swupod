import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildHyperspaceArtIndex, attachHyperspaceArt } from './hyperspaceRowArt'

const cards = [
  { name: 'Luke Skywalker', subtitle: 'I Can Save Him', set: 'ASH', type: 'Leader', variantType: 'Normal', imageUrl: 'n.png', backImageUrl: 'nb.png' },
  { name: 'Luke Skywalker', subtitle: 'I Can Save Him', set: 'ASH', type: 'Leader', variantType: 'Hyperspace', imageUrl: 'hs.png', backImageUrl: 'hsb.png' },
  { name: 'Enoch', subtitle: null, set: 'ASH', type: 'Unit', variantType: 'Hyperspace', imageUrl: 'enoch-hs.png', backImageUrl: null },
  { name: 'Enoch', subtitle: null, set: 'ASH', type: 'Unit', variantType: 'Hyperspace Foil', imageUrl: 'enoch-hsf.png', backImageUrl: null },
  { name: 'Ant Droid', subtitle: null, set: 'ASH', type: 'Unit', variantType: 'Normal', imageUrl: 'ant.png', backImageUrl: null },
]

describe('attachHyperspaceArt', () => {
  const index = buildHyperspaceArtIndex(cards)

  it('adds the Hyperspace printing art by name and subtitle', () => {
    const [row] = attachHyperspaceArt([{ cardName: 'Luke Skywalker', subtitle: 'I Can Save Him' }], index)
    assert.equal(row?.hyperspaceImageUrl, 'hs.png')
    assert.equal(row?.hyperspaceBackImageUrl, 'hsb.png')
  })

  it('uses the plain Hyperspace printing, not the foil', () => {
    const [row] = attachHyperspaceArt([{ cardName: 'Enoch', subtitle: null }], index)
    assert.equal(row?.hyperspaceImageUrl, 'enoch-hs.png')
  })

  it('matches a bare leader name when the row has no subtitle', () => {
    const [row] = attachHyperspaceArt([{ leaderName: 'Luke Skywalker' }], index, 'leaderName')
    assert.equal(row?.hyperspaceBackImageUrl, 'hsb.png')
  })

  it('leaves cards without a Hyperspace printing at null', () => {
    const [row] = attachHyperspaceArt([{ cardName: 'Ant Droid', subtitle: null }], index)
    assert.equal(row?.hyperspaceImageUrl, null)
    assert.equal(row?.hyperspaceBackImageUrl, null)
  })
})
