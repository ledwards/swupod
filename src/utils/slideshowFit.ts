/**
 * slideshowFit — pure fit-to-viewport geometry for Draft Report Slideshow Mode (U2).
 *
 * No React, no DOM, no I/O. Given a measured content box, per-row card counts, and
 * the card aspect (width/height), compute the largest card pixel size that fills the
 * space WITHOUT scrolling — capping at the asset's native resolution and flagging
 * sub-floor density. "Components Don't Calculate": the stage calls this via a hook.
 *
 * Two layout modes (see the plan's Layout decision matrix + Fit algorithm):
 *   - Single-player: pack ONE pack's n cards into the R×C grid that MAXIMIZES card
 *     size within the box, then cap at native resolution and center when capped.
 *   - Multi-player: one row per selected seat; uniform card height = the SMALLER of
 *     height-share, width-fit (densest row), and native cap. Either axis can bind.
 *
 * aspect = width / height. Portrait (cards): 2.5/3.5. Landscape (leaders): 3.5/2.5.
 */

/** A clamped-at-zero non-negative number (never emit negative dimensions). */
const nonNeg = (n: number): number => (n > 0 && Number.isFinite(n) ? n : 0)

export interface NativeCap {
  w: number
  h: number
}

export interface SinglePlayerFitArgs {
  boxW: number
  boxH: number
  n: number
  aspect: number
  nativeCap: NativeCap
  gap: number
}

export interface SinglePlayerFit {
  cols: number
  rows: number
  cardW: number
  cardH: number
  centered: boolean
}

export interface MultiPlayerFitArgs {
  boxW: number
  boxH: number
  perRowCounts: number[]
  aspect: number
  nativeCap: NativeCap
  labelGutterW: number
  gap: number
  minCardH: number
}

export interface MultiPlayerFit {
  cardW: number
  cardH: number
  overflow: boolean
}

/**
 * Single-player: maximize card size packing `n` cards into the box, then cap.
 *
 * Iterate column counts 1..n. For each, derive cardW from the width budget; if the
 * resulting grid is too tall, re-bind by height instead. Keep the column count that
 * yields the largest cardW. Finally, if that card is wider than the native cap, clamp
 * to the cap and mark `centered` (the stage centers the block in the box).
 */
export function computeSinglePlayerFit({
  boxW,
  boxH,
  n,
  aspect,
  nativeCap,
  gap,
}: SinglePlayerFitArgs): SinglePlayerFit {
  if (n <= 0 || aspect <= 0) {
    return { cols: 0, rows: 0, cardW: 0, cardH: 0, centered: false }
  }

  let best: { cols: number; rows: number; cardW: number; cardH: number } | null = null

  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)

    // Width-bound first: divide the horizontal budget across `cols` cards.
    let cardW = (boxW - (cols + 1) * gap) / cols
    let cardH = cardW / aspect

    // If that grid overflows vertically, re-bind by height.
    if (cardH * rows + (rows + 1) * gap > boxH) {
      cardH = (boxH - (rows + 1) * gap) / rows
      cardW = cardH * aspect
    }

    if (!best || cardW > best.cardW) {
      best = { cols, rows, cardW, cardH }
    }
  }

  // best is non-null because n >= 1.
  let { cols, rows, cardW, cardH } = best as NonNullable<typeof best>
  let centered = false

  // Native-resolution cap (R6): never upscale a card beyond its source pixels.
  if (cardW > nativeCap.w) {
    cardW = nativeCap.w
    cardH = nativeCap.w / aspect
    centered = true
  }

  return { cols, rows, cardW: nonNeg(cardW), cardH: nonNeg(cardH), centered }
}

/**
 * Multi-player: one row per seat; uniform card height is the SMALLER of width-fit
 * (so the densest row fits horizontally), height-share (so all R rows + gaps fit
 * vertically), and the native cap. Below `minCardH` the cards still shrink to fit
 * but `overflow:true` is flagged (telemetry / E2E awareness — detail-on-demand is
 * the existing hover/long-press preview; there is NO scroll fallback).
 */
export function computeMultiPlayerFit({
  boxW,
  boxH,
  perRowCounts,
  aspect,
  nativeCap,
  labelGutterW,
  gap,
  minCardH,
}: MultiPlayerFitArgs): MultiPlayerFit {
  const R = perRowCounts.length
  if (R === 0 || aspect <= 0) {
    return { cardW: 0, cardH: 0, overflow: false }
  }

  const maxCount = Math.max(...perRowCounts)
  const availW = boxW - labelGutterW

  // Densest row must fit horizontally: each of `maxCount` cards gets (availW/maxCount),
  // minus one gap, then converted to a height via the aspect.
  const hByWidth = maxCount > 0 ? (availW / maxCount - gap) / aspect : Infinity
  // All R rows plus their R+1 gaps must fit vertically.
  const hByHeight = (boxH - (R + 1) * gap) / R

  // Take the min — either width or height (or the native cap) can bind.
  const cardH = Math.min(hByWidth, hByHeight, nativeCap.h)
  const cardW = cardH * aspect

  return {
    cardW: nonNeg(cardW),
    cardH: nonNeg(cardH),
    // Density flag is judged on the true (pre-clamp) height so a degenerate/clamped
    // box still reports as below the readability floor.
    overflow: cardH < minCardH,
  }
}
