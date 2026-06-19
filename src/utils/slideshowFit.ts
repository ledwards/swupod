export interface NativeCardCap { w: number; h: number }

export interface SinglePlayerFitOptions {
  boxW: number; boxH: number; cardCount: number; aspect: number; nativeCap: NativeCardCap; gap?: number
}

export interface SinglePlayerFit {
  cols: number; rows: number; cardW: number; cardH: number; blockW: number; blockH: number
  centered: boolean; capped: boolean; overflow: boolean
}

export interface MultiPlayerFitOptions {
  boxW: number; boxH: number; perRowCounts: number[]; aspect: number; nativeCap: NativeCardCap
  gap?: number; labelGutterW?: number; minCardH?: number
}

export interface MultiPlayerFit {
  rowCount: number; maxCardsPerRow: number; cardW: number; cardH: number; blockW: number; blockH: number
  contentW: number; labelGutterW: number; overflow: boolean; capped: boolean; fitsWidth: boolean; fitsHeight: boolean
}

export interface LeaderGridFitOptions {
  boxW: number; boxH: number; seatCount: number; cardsPerSeat: number; aspect: number; nativeCap: NativeCardCap
  columns?: number; gap?: number; columnGap?: number; labelGutterW?: number; labelGap?: number; minCardH?: number
}

export interface LeaderGridFit {
  seatCount: number; columns: number; rows: number; cardsPerSeat: number; cardW: number; cardH: number
  groupW: number; groupH: number; blockW: number; blockH: number; contentW: number; labelGutterW: number
  overflow: boolean; capped: boolean; fitsWidth: boolean; fitsHeight: boolean
}

const EPSILON = 0.001

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function count(value: number): number {
  return Math.floor(nonNegative(value))
}

function normalizeCap(nativeCap: NativeCardCap): NativeCardCap {
  return {
    w: nonNegative(nativeCap.w),
    h: nonNegative(nativeCap.h),
  }
}

function zeroSingle(): SinglePlayerFit {
  return { cols: 0, rows: 0, cardW: 0, cardH: 0, blockW: 0, blockH: 0, centered: false, capped: false, overflow: false }
}

function zeroMulti(rowCount = 0, maxCardsPerRow = 0, labelGutterW = 0): MultiPlayerFit {
  return {
    rowCount, maxCardsPerRow, cardW: 0, cardH: 0, blockW: 0, blockH: 0, contentW: 0, labelGutterW,
    overflow: false, capped: false, fitsWidth: true, fitsHeight: true,
  }
}

function zeroLeaderGrid(
  seatCount = 0,
  columns = 0,
  rows = 0,
  cardsPerSeat = 0,
  labelGutterW = 0
): LeaderGridFit {
  return {
    seatCount, columns, rows, cardsPerSeat, cardW: 0, cardH: 0, groupW: 0, groupH: 0, blockW: 0, blockH: 0,
    contentW: 0, labelGutterW, overflow: false, capped: false, fitsWidth: true, fitsHeight: true,
  }
}

function nativeWidthLimit(nativeCap: NativeCardCap, aspect: number): number {
  const cap = normalizeCap(nativeCap)
  if (aspect <= 0 || cap.w <= 0 || cap.h <= 0) return 0
  return Math.min(cap.w, cap.h * aspect)
}

function capSize(cardW: number, cardH: number, aspect: number, nativeCap: NativeCardCap) {
  const maxW = nativeWidthLimit(nativeCap, aspect)
  if (cardW <= 0 || cardH <= 0 || maxW <= 0) {
    return { cardW: 0, cardH: 0, capped: cardW > 0 || cardH > 0 }
  }

  if (cardW <= maxW + EPSILON) {
    return { cardW, cardH, capped: false }
  }

  return {
    cardW: maxW,
    cardH: maxW / aspect,
    capped: true,
  }
}

function blockWidth(cols: number, cardW: number, gap: number): number {
  if (cols <= 0 || cardW <= 0) return 0
  return cols * cardW + Math.max(0, cols - 1) * gap
}

function blockHeight(rows: number, cardH: number, gap: number): number {
  if (rows <= 0 || cardH <= 0) return 0
  return rows * cardH + Math.max(0, rows - 1) * gap
}

export function computeSinglePlayerFit(options: SinglePlayerFitOptions): SinglePlayerFit {
  const boxW = nonNegative(options.boxW)
  const boxH = nonNegative(options.boxH)
  const aspect = nonNegative(options.aspect)
  const gap = nonNegative(options.gap ?? 0)
  const cardCount = count(options.cardCount)

  if (boxW <= 0 || boxH <= 0 || aspect <= 0 || cardCount <= 0) {
    return zeroSingle()
  }

  let best = zeroSingle()

  for (let cols = 1; cols <= cardCount; cols += 1) {
    const rows = Math.ceil(cardCount / cols)
    const availableW = Math.max(0, boxW - Math.max(0, cols - 1) * gap)
    const availableH = Math.max(0, boxH - Math.max(0, rows - 1) * gap)
    const widthBoundW = availableW / cols
    const heightBoundH = availableH / rows

    let cardW = widthBoundW
    let cardH = cardW / aspect

    if (cardH > heightBoundH) {
      cardH = heightBoundH
      cardW = cardH * aspect
    }

    if (
      cardW > best.cardW + EPSILON ||
      (Math.abs(cardW - best.cardW) <= EPSILON && (best.rows === 0 || rows < best.rows))
    ) {
      best = {
        cols,
        rows,
        cardW,
        cardH,
        blockW: blockWidth(cols, cardW, gap),
        blockH: blockHeight(rows, cardH, gap),
        centered: false,
        capped: false,
        overflow: false,
      }
    }
  }

  const capped = capSize(best.cardW, best.cardH, aspect, options.nativeCap)
  const finalBlockW = blockWidth(best.cols, capped.cardW, gap)
  const finalBlockH = blockHeight(best.rows, capped.cardH, gap)

  return {
    cols: capped.cardW > 0 ? best.cols : 0,
    rows: capped.cardH > 0 ? best.rows : 0,
    cardW: capped.cardW,
    cardH: capped.cardH,
    blockW: finalBlockW,
    blockH: finalBlockH,
    centered: capped.capped,
    capped: capped.capped,
    overflow: finalBlockW > boxW + EPSILON || finalBlockH > boxH + EPSILON,
  }
}

export function computeMultiPlayerFit(options: MultiPlayerFitOptions): MultiPlayerFit {
  const boxW = nonNegative(options.boxW)
  const boxH = nonNegative(options.boxH)
  const aspect = nonNegative(options.aspect)
  const gap = nonNegative(options.gap ?? 0)
  const labelGutterW = nonNegative(options.labelGutterW ?? 0)
  const minCardH = nonNegative(options.minCardH ?? 0)
  const counts = options.perRowCounts.map(count)
  const rowCount = counts.length
  const maxCardsPerRow = rowCount > 0 ? Math.max(...counts) : 0

  if (boxW <= 0 || boxH <= 0 || aspect <= 0 || rowCount <= 0) {
    return {
      ...zeroMulti(rowCount, maxCardsPerRow, labelGutterW),
      overflow: rowCount > 0 && minCardH > 0,
    }
  }

  const layoutCardsPerRow = Math.max(1, maxCardsPerRow)
  const contentW = Math.max(0, boxW - labelGutterW)
  const widthForCards = Math.max(0, contentW - Math.max(0, layoutCardsPerRow - 1) * gap)
  const heightForCards = Math.max(0, boxH - Math.max(0, rowCount - 1) * gap)
  const hByWidth = widthForCards / layoutCardsPerRow / aspect
  const hByHeight = heightForCards / rowCount
  const hByNative = nativeWidthLimit(options.nativeCap, aspect) / aspect
  const cardH = Math.min(hByWidth, hByHeight, hByNative)
  const cardW = cardH * aspect
  const finalBlockW = blockWidth(layoutCardsPerRow, cardW, gap)
  const finalBlockH = blockHeight(rowCount, cardH, gap)

  return {
    rowCount,
    maxCardsPerRow,
    cardW,
    cardH,
    blockW: finalBlockW,
    blockH: finalBlockH,
    contentW,
    labelGutterW,
    overflow: cardH < minCardH,
    capped: hByNative <= hByWidth + EPSILON && hByNative <= hByHeight + EPSILON,
    fitsWidth: finalBlockW <= contentW + EPSILON,
    fitsHeight: finalBlockH <= boxH + EPSILON,
  }
}

export function computeLeaderGridFit(options: LeaderGridFitOptions): LeaderGridFit {
  const boxW = nonNegative(options.boxW)
  const boxH = nonNegative(options.boxH)
  const aspect = nonNegative(options.aspect)
  const gap = nonNegative(options.gap ?? 0)
  const columnGap = nonNegative(options.columnGap ?? gap)
  const labelGutterW = nonNegative(options.labelGutterW ?? 0)
  const labelGap = nonNegative(options.labelGap ?? 0)
  const minCardH = nonNegative(options.minCardH ?? 0)
  const seatCount = count(options.seatCount)
  const cardsPerSeat = Math.max(1, count(options.cardsPerSeat))
  const requestedColumns = Math.max(1, count(options.columns ?? 2))
  const columns = seatCount > 0 ? Math.min(requestedColumns, seatCount) : requestedColumns
  const rows = seatCount > 0 ? Math.ceil(seatCount / columns) : 0

  if (boxW <= 0 || boxH <= 0 || aspect <= 0 || seatCount <= 0 || rows <= 0 || columns <= 0) {
    return {
      ...zeroLeaderGrid(seatCount, columns, rows, cardsPerSeat, labelGutterW),
      overflow: seatCount > 0 && minCardH > 0,
    }
  }

  const groupW = Math.max(0, (boxW - Math.max(0, columns - 1) * columnGap) / columns)
  const groupH = Math.max(0, (boxH - Math.max(0, rows - 1) * gap) / rows)
  const contentW = Math.max(0, groupW - labelGutterW - labelGap)
  const widthForCards = Math.max(0, contentW - Math.max(0, cardsPerSeat - 1) * gap)
  const hByWidth = widthForCards / cardsPerSeat / aspect
  const hByHeight = groupH
  const hByNative = nativeWidthLimit(options.nativeCap, aspect) / aspect
  const cardH = Math.min(hByWidth, hByHeight, hByNative)
  const cardW = cardH * aspect
  const finalGroupContentW = labelGutterW + labelGap + blockWidth(cardsPerSeat, cardW, gap)
  const finalBlockW = columns * finalGroupContentW + Math.max(0, columns - 1) * columnGap
  const finalBlockH = blockHeight(rows, cardH, gap)
  const fitsWidth = finalGroupContentW <= groupW + EPSILON
  const fitsHeight = cardH <= groupH + EPSILON

  return {
    seatCount,
    columns,
    rows,
    cardsPerSeat,
    cardW,
    cardH,
    groupW,
    groupH,
    blockW: finalBlockW,
    blockH: finalBlockH,
    contentW,
    labelGutterW,
    overflow: cardH < minCardH || !fitsWidth || !fitsHeight,
    capped: hByNative <= hByWidth + EPSILON && hByNative <= hByHeight + EPSILON,
    fitsWidth,
    fitsHeight,
  }
}
