/**
 * Spec-first tests for slideshowFit — the fit-to-viewport geometry util (U2).
 *
 * Every expected value below is derived BY HAND from the fit pseudo-code in
 * docs/plans/2026-06-17-001-feat-draft-report-slideshow-mode-plan.md
 * ("Fit algorithm" + "Layout decision matrix"), NOT read off the implementation.
 *
 * The math is the spec. The HARD assertions are the no-overflow invariants:
 *   - multi: cardH*R + (R+1)*gap <= boxH  AND the densest row fits availW
 *   - single: the chosen grid fits inside boxW x boxH and is capped at native res
 * Exact px values are computed from the constants chosen here.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { computeSinglePlayerFit, computeMultiPlayerFit } from './slideshowFit'

// === Shared constants (used consistently across every assertion) ===
const GAP = 8
const LABEL_GUTTER_W = 150
const MIN_CARD_H = 70
const ASPECT_PORTRAIT = 2.5 / 3.5 // ~0.714 (width/height)
const ASPECT_LANDSCAPE = 3.5 / 2.5 // 1.4 (leaders)
const NATIVE_CAP_PORTRAIT = { w: 734, h: 1024 }
const NATIVE_CAP_LANDSCAPE = { w: 1024, h: 734 }

// 1920x1080 content box (minus reserved chrome) and 1024x768 4:3 content box.
const BOX_BIG = { w: 1732, h: 842 }
const BOX_SMALL_43 = { w: 836, h: 530 }

const approx = (actual: number, expected: number, tol = 1.0, msg = '') =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg} expected ~${expected} (±${tol}), got ${actual}`
  )

describe('slideshowFit', () => {
  describe('computeMultiPlayerFit', () => {
    it('multi worst case (readable): 1732x842, 8 rows x 14 portrait', () => {
      const r = computeMultiPlayerFit({
        boxW: BOX_BIG.w,
        boxH: BOX_BIG.h,
        perRowCounts: Array(8).fill(14),
        aspect: ASPECT_PORTRAIT,
        nativeCap: NATIVE_CAP_PORTRAIT,
        labelGutterW: LABEL_GUTTER_W,
        gap: GAP,
        minCardH: MIN_CARD_H,
      })
      // hByHeight = (842 - 9*8)/8 = 770/8 = 96.25 ; hByWidth = (1582/14 - 8)/0.714 = 147 ; min = 96.25
      approx(r.cardH, 96.25, 1.0, 'readable cardH (height binds)')
      approx(r.cardW, 96.25 * ASPECT_PORTRAIT, 1.0, 'readable cardW')
      assert.strictEqual(r.overflow, false, 'readable density is above the floor')
      // HARD invariant: no vertical overflow.
      assert.ok(r.cardH * 8 + 9 * GAP <= BOX_BIG.h + 0.001, 'no vertical overflow')
      // HARD invariant: densest row fits availW.
      const availW = BOX_BIG.w - LABEL_GUTTER_W
      assert.ok(14 * r.cardW + 13 * GAP <= availW + 0.001, 'densest row fits availW')
    })

    it('multi worst case (cramped): 836x530, 8 rows x 14 -> overflow, still no overflow geometrically', () => {
      const r = computeMultiPlayerFit({
        boxW: BOX_SMALL_43.w,
        boxH: BOX_SMALL_43.h,
        perRowCounts: Array(8).fill(14),
        aspect: ASPECT_PORTRAIT,
        nativeCap: NATIVE_CAP_PORTRAIT,
        labelGutterW: LABEL_GUTTER_W,
        gap: GAP,
        minCardH: MIN_CARD_H,
      })
      // hByHeight = (530 - 72)/8 = 57.25 ; hByWidth = (686/14 - 8)/0.714 = 57.4 ; min = 57.25
      approx(r.cardH, 57.25, 1.0, 'cramped cardH')
      assert.strictEqual(r.overflow, true, 'cramped is below the readability floor')
      // HARD invariant: still no vertical overflow even though cards are tiny.
      assert.ok(r.cardH * 8 + 9 * GAP <= BOX_SMALL_43.h + 0.001, 'cramped: no vertical overflow')
    })

    it('multi ragged rows [14,1,7]: uniform cardH, widest row fits availW, 3 rows fit boxH', () => {
      const r = computeMultiPlayerFit({
        boxW: BOX_BIG.w,
        boxH: BOX_BIG.h,
        perRowCounts: [14, 1, 7],
        aspect: ASPECT_PORTRAIT,
        nativeCap: NATIVE_CAP_PORTRAIT,
        labelGutterW: LABEL_GUTTER_W,
        gap: GAP,
        minCardH: MIN_CARD_H,
      })
      // R=3, maxCount=14. hByWidth=(1582/14 - 8)/0.714=147 ; hByHeight=(842-32)/3=270 ; min=147
      approx(r.cardH, 147, 1.0, 'ragged cardH (width binds via densest row)')
      // uniform height: the returned cardH is a single number applied to every row.
      assert.strictEqual(typeof r.cardH, 'number')
      // densest row (14) fits availW.
      const availW = BOX_BIG.w - LABEL_GUTTER_W
      assert.ok(14 * r.cardW + 13 * GAP <= availW + 0.001, 'widest row fits availW')
      // all 3 rows fit boxH.
      assert.ok(r.cardH * 3 + 4 * GAP <= BOX_BIG.h + 0.001, '3 rows fit boxH')
    })

    it('multi caps at native height when the box would allow taller cards', () => {
      // 1 row, 1 card, in a very tall/wide box: width path huge, height path huge -> nativeCap.h binds.
      const r = computeMultiPlayerFit({
        boxW: 4000,
        boxH: 4000,
        perRowCounts: [1],
        aspect: ASPECT_PORTRAIT,
        nativeCap: NATIVE_CAP_PORTRAIT,
        labelGutterW: LABEL_GUTTER_W,
        gap: GAP,
        minCardH: MIN_CARD_H,
      })
      approx(r.cardH, NATIVE_CAP_PORTRAIT.h, 0.001, 'capped at native height')
      approx(r.cardW, NATIVE_CAP_PORTRAIT.h * ASPECT_PORTRAIT, 0.001, 'cardW from capped height')
    })

    it('multi edge: empty perRowCounts -> zero size, no throw', () => {
      const r = computeMultiPlayerFit({
        boxW: BOX_BIG.w,
        boxH: BOX_BIG.h,
        perRowCounts: [],
        aspect: ASPECT_PORTRAIT,
        nativeCap: NATIVE_CAP_PORTRAIT,
        labelGutterW: LABEL_GUTTER_W,
        gap: GAP,
        minCardH: MIN_CARD_H,
      })
      assert.strictEqual(r.cardH, 0)
      assert.strictEqual(r.cardW, 0)
    })

    it('multi edge: tiny box never returns negative dimensions', () => {
      const r = computeMultiPlayerFit({
        boxW: 10,
        boxH: 10,
        perRowCounts: Array(8).fill(14),
        aspect: ASPECT_PORTRAIT,
        nativeCap: NATIVE_CAP_PORTRAIT,
        labelGutterW: LABEL_GUTTER_W,
        gap: GAP,
        minCardH: MIN_CARD_H,
      })
      assert.ok(r.cardH >= 0, 'cardH clamped at 0')
      assert.ok(r.cardW >= 0, 'cardW clamped at 0')
      assert.strictEqual(r.overflow, true, 'tiny box is below floor')
    })
  })

  describe('computeSinglePlayerFit', () => {
    it('single many: 1732x842, 14 portrait -> packs into a grid, bigger than multi, no native cap', () => {
      const r = computeSinglePlayerFit({
        boxW: BOX_BIG.w,
        boxH: BOX_BIG.h,
        n: 14,
        aspect: ASPECT_PORTRAIT,
        nativeCap: NATIVE_CAP_PORTRAIT,
        gap: GAP,
      })
      // Best packing is 7 cols x 2 rows: height path (842-24)/2=409 -> cardW=409*0.714=292;
      // width path (1732-64)/7=238.3 -> cardH=333.6 ; per-col chooses max cardW => 7x2 wins with cardW=238.3.
      assert.strictEqual(r.cols, 7, '7 columns maximizes card size')
      assert.strictEqual(r.rows, 2, '2 rows for 14 cards in 7 cols')
      approx(r.cardW, 238.29, 1.0, 'single-many cardW')
      assert.strictEqual(r.centered, false, 'no native cap hit')
      assert.ok(r.cardW < NATIVE_CAP_PORTRAIT.w, 'under native cap')
      // bigger than the 8x14 multi case (96.25*aspect ~ 68.75 wide).
      assert.ok(r.cardW > 68.75, 'single is larger than multi')
      // HARD invariant: grid fits the box.
      assert.ok(r.cardW * r.cols + (r.cols + 1) * GAP <= BOX_BIG.w + 0.001, 'cols fit boxW')
      assert.ok(r.cardH * r.rows + (r.rows + 1) * GAP <= BOX_BIG.h + 0.001, 'rows fit boxH')
    })

    it('single one (last pick): 1732x842, 1 portrait -> capped at native res, area << box, centered when capped', () => {
      const r = computeSinglePlayerFit({
        boxW: BOX_BIG.w,
        boxH: BOX_BIG.h,
        n: 1,
        aspect: ASPECT_PORTRAIT,
        nativeCap: NATIVE_CAP_PORTRAIT,
        gap: GAP,
      })
      // Height-bound: cardH=(842-16)=826 -> cardW=826*0.714=590. Under the 734 cap, so NOT capped here.
      // R6 intent: the single card must NOT fill the screen.
      assert.ok(r.cardW <= NATIVE_CAP_PORTRAIT.w + 0.001, 'never exceeds native width')
      const cardArea = r.cardW * r.cardH
      const boxArea = BOX_BIG.w * BOX_BIG.h
      assert.ok(cardArea / boxArea < 0.5, 'single card area is far less than the box (does not fill screen)')
      // HARD invariant: fits the box.
      assert.ok(r.cardH + 2 * GAP <= BOX_BIG.h + 0.001, 'fits boxH')
    })

    it('single one in a tall box: width would exceed cap -> cardW === nativeCap.w, centered:true', () => {
      const r = computeSinglePlayerFit({
        boxW: 1732,
        boxH: 2000,
        n: 1,
        aspect: ASPECT_PORTRAIT,
        nativeCap: NATIVE_CAP_PORTRAIT,
        gap: GAP,
      })
      // Uncapped cardW would be min(width-path 1716, height-path (2000-16)*0.714=1417)=1417 > 734 -> caps.
      assert.strictEqual(r.cardW, NATIVE_CAP_PORTRAIT.w, 'capped exactly at native width')
      approx(r.cardH, NATIVE_CAP_PORTRAIT.w / ASPECT_PORTRAIT, 0.001, 'cardH derived from capped width')
      assert.strictEqual(r.centered, true, 'centered when capped')
    })

    it('single landscape (leader): aspect 3.5/2.5, 1 card @1732x842 -> caps at landscape native, centered', () => {
      const r = computeSinglePlayerFit({
        boxW: BOX_BIG.w,
        boxH: BOX_BIG.h,
        n: 1,
        aspect: ASPECT_LANDSCAPE,
        nativeCap: NATIVE_CAP_LANDSCAPE,
        gap: GAP,
      })
      // Width path (1732-16)=1716 ; height path (842-16)*1.4=1156 ; min=1156 > 1024 cap -> caps at 1024.
      assert.strictEqual(r.cardW, NATIVE_CAP_LANDSCAPE.w, 'landscape capped at native width')
      approx(r.cardH, NATIVE_CAP_LANDSCAPE.w / ASPECT_LANDSCAPE, 0.001, 'landscape cardH from cap')
      assert.strictEqual(r.centered, true, 'centered when capped')
    })

    it('single landscape leaders: 3 landscape cards fit without overflow, cap respected', () => {
      const r = computeSinglePlayerFit({
        boxW: BOX_BIG.w,
        boxH: BOX_BIG.h,
        n: 3,
        aspect: ASPECT_LANDSCAPE,
        nativeCap: NATIVE_CAP_LANDSCAPE,
        gap: GAP,
      })
      assert.ok(r.cardW <= NATIVE_CAP_LANDSCAPE.w + 0.001, 'landscape under/at cap')
      assert.ok(r.cardW > 0 && r.cardH > 0, 'positive dimensions')
      // HARD invariant: chosen grid fits the box.
      assert.ok(r.cardW * r.cols + (r.cols + 1) * GAP <= BOX_BIG.w + 0.001, 'cols fit boxW')
      assert.ok(r.cardH * r.rows + (r.rows + 1) * GAP <= BOX_BIG.h + 0.001, 'rows fit boxH')
    })

    it('ultrawide: 3440x842, 1 portrait -> still bounded, does not balloon, area << box', () => {
      const r = computeSinglePlayerFit({
        boxW: 3440,
        boxH: 842,
        n: 1,
        aspect: ASPECT_PORTRAIT,
        nativeCap: NATIVE_CAP_PORTRAIT,
        gap: GAP,
      })
      // Height-bound at 826 tall -> 590 wide, under cap. Doesn't fill the ultrawide box.
      assert.ok(r.cardW <= NATIVE_CAP_PORTRAIT.w + 0.001, 'never exceeds native width on ultrawide')
      const cardArea = r.cardW * r.cardH
      assert.ok(cardArea / (3440 * 842) < 0.25, 'card area is a small fraction of the ultrawide box')
    })

    it('edge: n === 0 -> zero-size without throwing', () => {
      const r = computeSinglePlayerFit({
        boxW: BOX_BIG.w,
        boxH: BOX_BIG.h,
        n: 0,
        aspect: ASPECT_PORTRAIT,
        nativeCap: NATIVE_CAP_PORTRAIT,
        gap: GAP,
      })
      assert.strictEqual(r.cardW, 0)
      assert.strictEqual(r.cardH, 0)
      assert.strictEqual(r.cols, 0)
      assert.strictEqual(r.rows, 0)
    })

    it('edge: tiny box never returns negative dimensions', () => {
      const r = computeSinglePlayerFit({
        boxW: 10,
        boxH: 10,
        n: 14,
        aspect: ASPECT_PORTRAIT,
        nativeCap: NATIVE_CAP_PORTRAIT,
        gap: GAP,
      })
      assert.ok(r.cardW >= 0, 'cardW clamped at 0')
      assert.ok(r.cardH >= 0, 'cardH clamped at 0')
    })
  })
})
