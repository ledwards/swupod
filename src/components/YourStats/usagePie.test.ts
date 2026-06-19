/**
 * Spec tests for the usage-pie color stops + palette ("Your Leaders" /
 * "Your Archetypes").
 *
 * Each wedge gets its OWN palette color (not a base aspect, which collide), and a
 * thin transparent cut is carved at every wedge boundary — including the 0°/360°
 * seam — so wedges never blend into one solid disc.
 *
 * Run: npx tsx --test src/components/YourStats/usagePie.test.ts
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildUsagePieStops, usagePieColor, USAGE_PIE_COLORS } from './usagePie'

describe('buildUsagePieStops', () => {
  it('separates two wedges with a transparent cut (not one solid disc)', () => {
    const stops = buildUsagePieStops([
      { matches: 2, color: '#4A90E2' },
      { matches: 1, color: '#E1654A' },
    ])
    assert.ok(stops, 'expected stops for played items')
    assert.match(stops!, /transparent/)
    // Each item keeps its own colored band; no 0deg→360deg single run.
    assert.match(stops!, /#4A90E2/)
    assert.match(stops!, /#E1654A/)
    assert.doesNotMatch(stops!, /#4A90E2 0deg 360deg/)
  })

  it('still cuts wedges that happen to share a color (defensive)', () => {
    const stops = buildUsagePieStops([
      { matches: 2, color: '#4A90E2' },
      { matches: 1, color: '#4A90E2' },
    ])
    const bands = (stops!.match(/#4A90E2/g) || []).length
    assert.equal(bands, 2, 'two distinct wedge bands even with a shared color')
  })

  it('cuts the 0°/360° seam so the first and last wedges are not fused', () => {
    const stops = buildUsagePieStops(
      [
        { matches: 1, color: '#4A90E2' },
        { matches: 1, color: '#27AE60' },
      ],
      4,
    )
    assert.match(stops!, /^transparent 0deg 2deg/)
    assert.match(stops!, /transparent 358deg 360deg$/)
  })

  it('renders a lone 100% item as a full disc (no cut)', () => {
    const stops = buildUsagePieStops([{ matches: 5, color: '#E1654A' }])
    assert.equal(stops, 'transparent 0deg 0deg, #E1654A 0deg 360deg, transparent 360deg 360deg')
  })

  it('returns null when nothing has been played', () => {
    assert.equal(buildUsagePieStops([]), null)
    assert.equal(buildUsagePieStops([{ matches: 0, color: '#fff' }]), null)
  })

  it('keeps a sliver of color for wedges thinner than the gap', () => {
    const stops = buildUsagePieStops([
      { matches: 1, color: '#F1C40F' },
      { matches: 199, color: '#4A90E2' },
    ])
    const band = stops!.match(/#F1C40F (\d+(?:\.\d+)?)deg (\d+(?:\.\d+)?)deg/)
    assert.ok(band, 'thin yellow wedge is still drawn')
    assert.ok(Number(band![2]) > Number(band![1]), 'thin wedge has positive width')
  })

  it('closes the circle at 360°', () => {
    const stops = buildUsagePieStops([
      { matches: 3, color: '#4A90E2' },
      { matches: 2, color: '#27AE60' },
      { matches: 1, color: '#E1654A' },
    ])
    assert.match(stops!, /360deg$/)
  })
})

describe('usagePieColor', () => {
  it('gives the first few items distinct colors', () => {
    const first = [0, 1, 2, 3].map(usagePieColor)
    assert.equal(new Set(first).size, 4, 'first four items are all different colors')
  })

  it('cycles through the palette past its length', () => {
    assert.equal(usagePieColor(USAGE_PIE_COLORS.length), USAGE_PIE_COLORS[0])
    assert.equal(usagePieColor(USAGE_PIE_COLORS.length + 1), USAGE_PIE_COLORS[1])
  })
})
