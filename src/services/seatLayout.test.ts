import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seatAngles } from './seatLayout'

const RADIUS = 42

/** Pixel position of a seat, using PlayerCircle's convention: 0° bottom, clockwise. */
function seatPoint(angle: number, width: number, height: number) {
  const rad = (angle * Math.PI) / 180
  return {
    x: (width * (50 + RADIUS * Math.sin(rad))) / 100,
    y: (height * (52.5 + RADIUS * Math.cos(rad))) / 100,
  }
}

function neighbourGaps(angles: number[], width: number, height: number) {
  const points = angles.map(a => seatPoint(a, width, height))
  return points.map((p, i) => {
    const q = points[(i + 1) % points.length]
    return Math.hypot(q.x - p.x, q.y - p.y)
  })
}

test('BUGGY: equal angles on a wide, short table bunch seats at the ends', () => {
  // The leader preview on a 1900×860 screen: the table is ~1240px wide and
  // ~110px tall. Equal angles put three seats on each end, overlapping.
  const equalAngles = Array.from({ length: 8 }, (_, i) => i * 45)
  const gaps = neighbourGaps(equalAngles, 1240, 110)
  assert.ok(Math.max(...gaps) / Math.min(...gaps) > 2)
})

test('FIXED: seats on a wide, short table are evenly spaced', () => {
  const gaps = neighbourGaps(seatAngles(8, 1240, 110), 1240, 110)
  // Straight-line neighbour gaps along an ellipse differ slightly from arc
  // length around the tight ends; within 10% reads as even.
  assert.ok(Math.max(...gaps) / Math.min(...gaps) < 1.1, `gaps ${gaps.map(g => g.toFixed(0)).join(', ')}`)
})

test('a square table keeps the familiar equal angles', () => {
  const angles = seatAngles(8, 600, 600)
  angles.forEach((a, i) => assert.ok(Math.abs(a - i * 45) < 0.5, `seat ${i} at ${a}`))
})

test('the viewer stays at the bottom and the far seat stays at the top', () => {
  const angles = seatAngles(8, 1240, 110)
  assert.equal(angles[0], 0)
  assert.ok(Math.abs(angles[4] - 180) < 0.5)
})

test('an unmeasured table falls back to equal angles', () => {
  assert.deepEqual(seatAngles(4, 0, 0), [0, 90, 180, 270])
})
