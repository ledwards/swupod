import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  computeLeaderGridFit,
  computeMultiPlayerFit,
  computeSinglePlayerFit,
} from './slideshowFit'

const PORTRAIT = 2.5 / 3.5
const LANDSCAPE = 3.5 / 2.5
const GAP = 8
const LABEL_GUTTER_W = 150
const MIN_CARD_H = 72

const PORTRAIT_NATIVE = { w: 734, h: 1024 }
const PORTRAIT_TEST_CAP = { w: 360, h: 504 }
const LANDSCAPE_TEST_CAP = { w: 500, h: 500 / LANDSCAPE }
const LEADER_LABEL_GUTTER_W = 132
const LEADER_COLUMN_GAP = 20
const LEADER_LABEL_GAP = 10

function assertNear(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  )
}

function assertMultiFits(fit, { boxW, boxH, counts, labelGutterW = LABEL_GUTTER_W, gap = GAP }) {
  const maxCards = Math.max(1, ...counts)
  const usedW = maxCards * fit.cardW + (maxCards - 1) * gap
  const usedH = counts.length * fit.cardH + Math.max(0, counts.length - 1) * gap

  assert.ok(usedW <= boxW - labelGutterW + 0.01, `row width ${usedW} should fit`)
  assert.ok(usedH <= boxH + 0.01, `row height ${usedH} should fit`)
}

function assertSingleFits(fit, { boxW, boxH }) {
  assert.ok(fit.blockW <= boxW + 0.01, `block width ${fit.blockW} should fit`)
  assert.ok(fit.blockH <= boxH + 0.01, `block height ${fit.blockH} should fit`)
  assert.strictEqual(fit.overflow, false)
}

describe('slideshowFit', () => {
  describe('computeMultiPlayerFit', () => {
    it('fits the 8x14 readable case without overflow', () => {
      const counts = Array(8).fill(14)
      const fit = computeMultiPlayerFit({
        boxW: 1732,
        boxH: 842,
        perRowCounts: counts,
        aspect: PORTRAIT,
        nativeCap: PORTRAIT_NATIVE,
        gap: GAP,
        labelGutterW: LABEL_GUTTER_W,
        minCardH: MIN_CARD_H,
      })

      assertNear(fit.cardH, 98.25)
      assertNear(fit.cardW, 70.18, 0.01)
      assert.strictEqual(fit.rowCount, 8)
      assert.strictEqual(fit.maxCardsPerRow, 14)
      assert.strictEqual(fit.overflow, false)
      assertMultiFits(fit, { boxW: 1732, boxH: 842, counts })
    })

    it('fits the 8x14 cramped case and flags the readability floor', () => {
      const counts = Array(8).fill(14)
      const fit = computeMultiPlayerFit({
        boxW: 836,
        boxH: 530,
        perRowCounts: counts,
        aspect: PORTRAIT,
        nativeCap: PORTRAIT_NATIVE,
        gap: GAP,
        labelGutterW: LABEL_GUTTER_W,
        minCardH: MIN_CARD_H,
      })

      assertNear(fit.cardH, 58.2)
      assertNear(fit.cardW, 41.57, 0.01)
      assert.strictEqual(fit.overflow, true)
      assertMultiFits(fit, { boxW: 836, boxH: 530, counts })
    })

    it('uses the widest ragged row while keeping one uniform card height', () => {
      const counts = [14, 1, 7]
      const fit = computeMultiPlayerFit({
        boxW: 1200,
        boxH: 420,
        perRowCounts: counts,
        aspect: PORTRAIT,
        nativeCap: PORTRAIT_NATIVE,
        gap: GAP,
        labelGutterW: LABEL_GUTTER_W,
        minCardH: MIN_CARD_H,
      })

      assertNear(fit.cardH, 94.6)
      assertNear(fit.cardW, 67.57, 0.01)
      assert.strictEqual(fit.rowCount, 3)
      assert.strictEqual(fit.maxCardsPerRow, 14)
      assert.strictEqual(fit.overflow, false)
      assertMultiFits(fit, { boxW: 1200, boxH: 420, counts })
    })
  })

  describe('computeLeaderGridFit', () => {
    it('fits eight three-card leader rows as two columns of four', () => {
      const fit = computeLeaderGridFit({
        boxW: 1194,
        boxH: 570,
        seatCount: 8,
        cardsPerSeat: 3,
        aspect: LANDSCAPE,
        nativeCap: LANDSCAPE_TEST_CAP,
        columns: 2,
        gap: GAP,
        columnGap: LEADER_COLUMN_GAP,
        labelGutterW: LEADER_LABEL_GUTTER_W,
        labelGap: LEADER_LABEL_GAP,
        minCardH: MIN_CARD_H,
      })

      assert.strictEqual(fit.columns, 2)
      assert.strictEqual(fit.rows, 4)
      assert.strictEqual(fit.cardsPerSeat, 3)
      assert.ok(fit.cardH > 90, 'two-column leader layout should keep leader cards readable')
      assert.strictEqual(fit.overflow, false)
      assert.ok(fit.fitsWidth)
      assert.ok(fit.fitsHeight)
    })

    it('flags leader grids below the readability floor without negative sizes', () => {
      const fit = computeLeaderGridFit({
        boxW: 480,
        boxH: 260,
        seatCount: 8,
        cardsPerSeat: 3,
        aspect: LANDSCAPE,
        nativeCap: LANDSCAPE_TEST_CAP,
        columns: 2,
        gap: GAP,
        columnGap: LEADER_COLUMN_GAP,
        labelGutterW: LEADER_LABEL_GUTTER_W,
        labelGap: LEADER_LABEL_GAP,
        minCardH: MIN_CARD_H,
      })

      assert.strictEqual(fit.columns, 2)
      assert.strictEqual(fit.rows, 4)
      assert.ok(fit.cardW >= 0)
      assert.ok(fit.cardH >= 0)
      assert.strictEqual(fit.overflow, true)
    })
  })

  describe('computeSinglePlayerFit', () => {
    it('packs many portrait cards into the largest fitting grid', () => {
      const fit = computeSinglePlayerFit({
        boxW: 1732,
        boxH: 842,
        cardCount: 14,
        aspect: PORTRAIT,
        nativeCap: PORTRAIT_NATIVE,
        gap: GAP,
      })

      assert.strictEqual(fit.cols, 7)
      assert.strictEqual(fit.rows, 2)
      assertNear(fit.cardW, 240.57, 0.01)
      assertNear(fit.cardH, 336.8)
      assert.strictEqual(fit.capped, false)
      assert.ok(fit.cardW > 70.18, 'single-player cards should be larger than the 8-row multi case')
      assertSingleFits(fit, { boxW: 1732, boxH: 842 })
    })

    it('caps and centers a single last-pick card', () => {
      const fit = computeSinglePlayerFit({
        boxW: 1732,
        boxH: 842,
        cardCount: 1,
        aspect: PORTRAIT,
        nativeCap: PORTRAIT_TEST_CAP,
        gap: GAP,
      })

      assert.strictEqual(fit.cols, 1)
      assert.strictEqual(fit.rows, 1)
      assert.strictEqual(fit.cardW, PORTRAIT_TEST_CAP.w)
      assert.strictEqual(fit.cardH, PORTRAIT_TEST_CAP.h)
      assert.strictEqual(fit.capped, true)
      assert.strictEqual(fit.centered, true)
      assert.ok(fit.blockW * fit.blockH < (1732 * 842) / 4)
      assertSingleFits(fit, { boxW: 1732, boxH: 842 })
    })

    it('handles landscape leader cards and respects the native cap', () => {
      const fit = computeSinglePlayerFit({
        boxW: 1732,
        boxH: 842,
        cardCount: 3,
        aspect: LANDSCAPE,
        nativeCap: LANDSCAPE_TEST_CAP,
        gap: GAP,
      })

      assert.strictEqual(fit.cols, 2)
      assert.strictEqual(fit.rows, 2)
      assert.strictEqual(fit.cardW, LANDSCAPE_TEST_CAP.w)
      assertNear(fit.cardH, LANDSCAPE_TEST_CAP.h)
      assert.strictEqual(fit.capped, true)
      assertNear(fit.cardW / fit.cardH, LANDSCAPE)
      assertSingleFits(fit, { boxW: 1732, boxH: 842 })
    })

    it('returns zero-size geometry for zero cards and never negative sizes for tiny boxes', () => {
      const empty = computeSinglePlayerFit({
        boxW: 1732,
        boxH: 842,
        cardCount: 0,
        aspect: PORTRAIT,
        nativeCap: PORTRAIT_NATIVE,
        gap: GAP,
      })

      assert.deepStrictEqual(
        { cols: empty.cols, rows: empty.rows, cardW: empty.cardW, cardH: empty.cardH },
        { cols: 0, rows: 0, cardW: 0, cardH: 0 }
      )

      const tiny = computeSinglePlayerFit({
        boxW: 4,
        boxH: 4,
        cardCount: 14,
        aspect: PORTRAIT,
        nativeCap: PORTRAIT_NATIVE,
        gap: GAP,
      })

      assert.ok(tiny.cardW >= 0)
      assert.ok(tiny.cardH >= 0)
      assert.ok(tiny.blockW >= 0)
      assert.ok(tiny.blockH >= 0)
      assertSingleFits(tiny, { boxW: 4, boxH: 4 })
    })

    it('keeps ultrawide single-card layouts capped instead of ballooning', () => {
      const fit = computeSinglePlayerFit({
        boxW: 3440,
        boxH: 842,
        cardCount: 1,
        aspect: PORTRAIT,
        nativeCap: PORTRAIT_TEST_CAP,
        gap: GAP,
      })

      assert.strictEqual(fit.cardW, PORTRAIT_TEST_CAP.w)
      assert.strictEqual(fit.cardH, PORTRAIT_TEST_CAP.h)
      assert.strictEqual(fit.centered, true)
      assertSingleFits(fit, { boxW: 3440, boxH: 842 })
    })
  })

  describe('edge clamping', () => {
    it('clamps invalid multi-player inputs to zero without throwing', () => {
      const fit = computeMultiPlayerFit({
        boxW: -10,
        boxH: Number.NaN,
        perRowCounts: [14, -1, Number.POSITIVE_INFINITY],
        aspect: PORTRAIT,
        nativeCap: { w: -1, h: 0 },
        gap: -8,
        labelGutterW: 120,
        minCardH: MIN_CARD_H,
      })

      assert.strictEqual(fit.cardW, 0)
      assert.strictEqual(fit.cardH, 0)
      assert.strictEqual(fit.rowCount, 3)
      assert.strictEqual(fit.maxCardsPerRow, 14)
      assert.strictEqual(fit.overflow, true)
      assert.ok(fit.blockW >= 0)
      assert.ok(fit.blockH >= 0)
    })
  })
})
