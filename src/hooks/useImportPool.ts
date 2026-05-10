// @ts-nocheck
/**
 * useImportPool — wizard state machine for the Import Pool feature (U6).
 *
 * useReducer over a discriminated-union state. One action per exposed verb.
 * Phases: idle → uploading → extracting → resolving → confirming → submitting
 *         → done | error
 *
 * The hook coordinates image upload, extraction (POST /api/import/extract),
 * row edits, and submission (POST /api/import/create). Validation runs
 * continuously as a derived selector.
 *
 * See docs/plans/2026-05-05-001-feat-import-pool-spike-plan.md U6.
 */

import { useReducer, useCallback, useMemo, useEffect } from 'react'
import { resizeImage, type ProcessedImage } from '../services/importPool/imagePrep'
import { saveImages as idbSaveImages, loadImages as idbLoadImages, clearImages as idbClearImages } from '../services/importPool/imageStore'
import { getCachedCards } from '../utils/cardCache'

const STORAGE_KEY = 'import-pool-wizard-v1'

// === Types ===

export interface ExtractedRow {
  name: string
  type: 'Leader' | 'Base' | 'Unit' | 'Event' | 'Upgrade'
  subtitle: string | null
  poolQty: number
  deckQty: number
  /** Confidence in the TOTAL column (pool qty) handwritten read. */
  poolQtyConfidence?: 'high' | 'medium' | 'low'
  /** Confidence in the PLAYED column (deck qty) handwritten read. */
  deckQtyConfidence?: 'high' | 'medium' | 'low'
}

export interface SectionGap {
  section: string
  count: number
  expectedLow: number
  expectedHigh: number
  message: string
}

/** Normalized [0,1] bounding box for a section on one photo. Used by the
 *  source-image modal to crop to a specific aspect section so the user can
 *  verify Claude's read against the right slice of the sheet. */
export interface SectionBounds {
  name:
    | 'Leaders'
    | 'Bases'
    | 'Vigilance'
    | 'Command'
    | 'Aggression'
    | 'Cunning'
    | 'Heroism'
    | 'Villainy'
    | 'Multicolor'
    | 'NoAspect'
  photoIndex: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface MatchedCard {
  id: string
  cardId: string
  name: string
  subtitle: string | null
  type: string
  aspects: string[]
  imageUrl: string
  isLeader: boolean
  isBase: boolean
}

export interface MatchedRow {
  extracted: ExtractedRow
  matched: MatchedCard | null
  candidates: MatchedCard[]
  confidence: 'exact' | 'high' | 'ambiguous' | 'fuzzy' | 'unmatched'
}

export interface ExtractedHeader {
  setCode: string
  setName: string
  eventName: string | null
  eventDate: string | null
  playerName: string | null
  leader: { name: string | null; subtitle: string | null }
  base: { name: string | null; subtitle: string | null }
}

export interface ExtractResponse {
  header: ExtractedHeader
  rows: MatchedRow[]
  /** Non-blocking warnings from the sanitization pass (e.g. clamped qty, dropped rows) */
  warnings?: string[]
  /** Section-level gap warnings (e.g. AGGRESSION has 3 cards, expected 5-18) */
  sectionGaps?: SectionGap[]
  /** Per-photo bounding boxes for each visible aspect section */
  sections?: SectionBounds[]
  /** Eval-capture session id — included in the create request so server
   *  can pair photos with user-corrected ground truth in /tmp/eval-captures. */
  sessionId?: string
}

/** A row as the user edits it in the Resolve step */
export interface ResolvedRow {
  /** Stable key for React */
  key: string
  /** The currently chosen card (may be null if unresolved) */
  card: MatchedCard | null
  /** Original extracted text — shown for context */
  extracted: ExtractedRow
  /** Candidates to pick from in the picker */
  candidates: MatchedCard[]
  /** Editable quantities */
  poolQty: number
  deckQty: number
  /** Original confidence for UI affordance */
  confidence: MatchedRow['confidence']
}

type Phase =
  | 'idle'
  | 'uploading'
  | 'extracting'
  | 'resolving'
  | 'confirming'
  | 'submitting'
  | 'done'
  | 'error'

interface ImportPoolState {
  phase: Phase
  images: ProcessedImage[]
  extraction: ExtractResponse | null
  resolvedRows: ResolvedRow[]
  activeLeaderId: string | null
  activeBaseId: string | null
  title: string
  isTitleDefault: boolean
  shareId: string | null
  warnings: string[]
  sectionGaps: SectionGap[]
  /** Per-photo bounds for each section, used to crop the source image
   *  to a single aspect when the user clicks the per-section magnifier. */
  sectionBounds: SectionBounds[]
  /** Row visibility filter: all sheet rows / only pool (poolQty>0) / only deck (deckQty>0) */
  viewFilter: 'all' | 'pool' | 'deck'
  /** Resolve-step rendering mode */
  viewMode: 'table' | 'grid'
  /** Anomaly keys the user has acknowledged via "mark as correct". Reset
   *  on every fresh extraction. Each anomaly carries a deterministic key
   *  (e.g. lowConf:pool:row-3) so dismissals stay tied to their source. */
  dismissedAnomalyKeys: string[]
  /** Eval-capture session id from the most recent extract response.
   *  Threaded into the create request so the server pairs photos with
   *  user-corrected ground truth in /tmp/eval-captures/<sessionId>/. */
  sessionId: string | null
  error: { code: string; message: string; details?: any } | null
}

const INITIAL_STATE: ImportPoolState = {
  phase: 'idle',
  images: [],
  extraction: null,
  resolvedRows: [],
  activeLeaderId: null,
  activeBaseId: null,
  title: '',
  isTitleDefault: true,
  shareId: null,
  warnings: [],
  sectionGaps: [],
  sectionBounds: [],
  viewFilter: 'pool',
  viewMode: 'table',
  dismissedAnomalyKeys: [],
  sessionId: null,
  error: null,
}

type Action =
  | { type: 'ADD_IMAGE'; image: ProcessedImage }
  | { type: 'REMOVE_IMAGE'; index: number }
  | { type: 'EXTRACTION_START' }
  | { type: 'EXTRACTION_SUCCESS'; response: ExtractResponse }
  | { type: 'EXTRACTION_FAILURE'; error: ImportPoolState['error'] }
  | { type: 'GO_TO_RESOLVE' }
  | { type: 'GO_TO_CONFIRM' }
  | { type: 'GO_TO_UPLOAD' }
  | { type: 'GO_BACK' }
  | { type: 'SET_ROW_QTY'; key: string; field: 'poolQty' | 'deckQty'; value: number }
  | { type: 'REPLACE_ROW_CARD'; key: string; card: MatchedCard }
  | {
      type: 'REPLACE_SECTION_ROWS'
      /** Map of cardId → new poolQty + deckQty + confidences. The reducer
       *  walks resolvedRows and replaces matching rows in place; rows in
       *  the section that aren't in the map (i.e. this re-extract didn't
       *  see them) are NOT touched. */
      updates: Array<{
        cardId: string
        poolQty: number
        deckQty: number
        poolQtyConfidence?: 'high' | 'medium' | 'low'
        deckQtyConfidence?: 'high' | 'medium' | 'low'
      }>
    }
  | { type: 'SET_ACTIVE_LEADER'; cardId: string }
  | { type: 'SET_ACTIVE_BASE'; cardId: string }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; shareId: string }
  | { type: 'SUBMIT_FAILURE'; error: ImportPoolState['error'] }
  | { type: 'RESET' }
  | { type: 'RESTORE'; state: Partial<ImportPoolState> }
  | { type: 'SET_VIEW_FILTER'; filter: 'all' | 'pool' | 'deck' }
  | { type: 'SET_VIEW_MODE'; mode: 'table' | 'grid' }
  | { type: 'DISMISS_ANOMALY'; anomalyKey: string }
  | { type: 'HYDRATE_IMAGES'; images: ProcessedImage[] }

function reducer(state: ImportPoolState, action: Action): ImportPoolState {
  switch (action.type) {
    case 'ADD_IMAGE': {
      // Cap at 2 photos. If we're already at the cap when a new file
      // arrives, drop the OLDEST and keep the new one rather than dropping
      // the new one silently — the user explicitly picked this file, so
      // their intent is "use this." The previous behavior (silent drop in
      // UploadStep + reducer accepting whatever it got) caused the bug
      // where IDB-hydrated leftover photos blocked fresh uploads.
      const next = [...state.images, action.image]
      const capped = next.length > 2 ? next.slice(next.length - 2) : next
      return {
        ...state,
        // Adding/removing images during/after extraction discards prior extraction
        // per scope: re-upload triggers a fresh CV pass.
        ...(state.extraction
          ? { extraction: null, resolvedRows: [], activeLeaderId: null, activeBaseId: null, title: '', warnings: [], dismissedAnomalyKeys: [] }
          : {}),
        phase: 'uploading',
        images: capped,
        error: null,
      }
    }
    case 'REMOVE_IMAGE': {
      const images = state.images.filter((_, i) => i !== action.index)
      return {
        ...state,
        ...(state.extraction
          ? { extraction: null, resolvedRows: [], activeLeaderId: null, activeBaseId: null, title: '', warnings: [], dismissedAnomalyKeys: [] }
          : {}),
        phase: images.length === 0 ? 'idle' : 'uploading',
        images,
        error: null,
      }
    }
    case 'EXTRACTION_START':
      return { ...state, phase: 'extracting', error: null }
    case 'EXTRACTION_SUCCESS': {
      const resolvedRows: ResolvedRow[] = action.response.rows.map((row, i) => ({
        key: `row-${i}`,
        card: row.matched,
        extracted: row.extracted,
        candidates: row.candidates,
        poolQty: row.extracted.poolQty,
        deckQty: row.extracted.deckQty,
        confidence: row.confidence,
      }))

      // Auto-set active leader/base from the extraction header if we can match.
      const header = action.response.header
      let activeLeaderId: string | null = null
      let activeBaseId: string | null = null
      if (header.leader.name) {
        const leaderRow = resolvedRows.find(
          (r) =>
            r.card?.isLeader &&
            r.card?.name?.toLowerCase() === header.leader.name?.toLowerCase() &&
            (!header.leader.subtitle || r.card?.subtitle?.toLowerCase() === header.leader.subtitle?.toLowerCase()),
        )
        if (leaderRow?.card) activeLeaderId = leaderRow.card.id
      }
      if (header.base.name) {
        const baseRow = resolvedRows.find(
          (r) => r.card?.isBase && r.card?.name?.toLowerCase() === header.base.name?.toLowerCase(),
        )
        if (baseRow?.card) activeBaseId = baseRow.card.id
      }

      // Fallback: if the header didn't yield an active leader/base (Phase 1
      // missed the printed header field, or the name didn't match a card),
      // infer from per-cell extraction. The card with deckQty=1 in the
      // Leader/Base table IS the active selection. Without this fallback,
      // users with a faint/unreadable header field see a phantom "Leader: ✗"
      // even though the right row is marked deck=1.
      if (!activeLeaderId) {
        const markedLeader = resolvedRows.find((r) => r.card?.isLeader && r.deckQty >= 1)
        if (markedLeader?.card) activeLeaderId = markedLeader.card.id
      }
      if (!activeBaseId) {
        const markedBase = resolvedRows.find((r) => r.card?.isBase && r.deckQty >= 1)
        if (markedBase?.card) activeBaseId = markedBase.card.id
      }

      // Auto-compose default title:
      //   No event name:  "{Player}'s {SET} Sealed Pool"
      //   With event:     "{Player}'s {Event Name} Sealed Pool {Date?}"
      // Falls back gracefully when player name is missing.
      const player = header.playerName || 'Imported'
      const set = header.setCode || 'Sealed'
      const ev = header.eventName ? `${header.eventName} ` : `${set} `
      const date = header.eventDate ? ` ${header.eventDate}` : ''
      const title = `${player}'s ${ev}Sealed Pool${date}`.replace(/\s+/g, ' ').trim().slice(0, 80)

      return {
        ...state,
        phase: 'resolving',
        extraction: action.response,
        resolvedRows,
        activeLeaderId,
        activeBaseId,
        title,
        isTitleDefault: true,
        warnings: action.response.warnings || [],
        sectionGaps: action.response.sectionGaps || [],
        sectionBounds: action.response.sections || [],
        // Fresh extraction means fresh anomalies — any prior "mark as
        // correct" dismissals were tied to the old data and can't carry over.
        dismissedAnomalyKeys: [],
        sessionId: action.response.sessionId || null,
        error: null,
      }
    }
    case 'EXTRACTION_FAILURE':
      return { ...state, phase: 'error', error: action.error }
    case 'GO_TO_RESOLVE':
      return { ...state, phase: 'resolving', error: null }
    case 'GO_TO_CONFIRM':
      return { ...state, phase: 'confirming', error: null }
    case 'GO_TO_UPLOAD':
      // Direct jump to the Upload step from any later phase. Used by the
      // wizard-level Re-upload button and the clickable Step 1 indicator.
      // Images/extraction are preserved; user can replace photos or just
      // re-extract from the same set.
      return { ...state, phase: 'uploading', error: null }
    case 'GO_BACK':
      // Resolve → Upload, Confirm → Resolve
      if (state.phase === 'confirming') return { ...state, phase: 'resolving' }
      if (state.phase === 'resolving') return { ...state, phase: 'uploading' }
      return state
    case 'SET_ROW_QTY':
      return {
        ...state,
        resolvedRows: state.resolvedRows.map((r) => {
          if (r.key !== action.key) return r
          const next = { ...r, [action.field]: Math.max(0, Math.min(6, action.value)) }
          // Clamp deckQty to poolQty
          if (next.deckQty > next.poolQty) next.deckQty = next.poolQty
          return next
        }),
      }
    case 'REPLACE_ROW_CARD':
      return {
        ...state,
        resolvedRows: state.resolvedRows.map((r) =>
          r.key === action.key ? { ...r, card: action.card, candidates: [], confidence: 'exact' } : r,
        ),
      }
    case 'REPLACE_SECTION_ROWS': {
      // Targeted re-extract: replace poolQty/deckQty/confidences for every
      // row whose card.id is in the updates map. Don't touch other rows.
      // Also clear any "mark as correct" dismissals tied to rows that just
      // changed — the user's prior verdict was on the old extraction value.
      const byCardId = new Map<string, (typeof action.updates)[number]>()
      for (const u of action.updates) byCardId.set(u.cardId, u)
      const touchedKeys = new Set<string>()
      const resolvedRows = state.resolvedRows.map((r) => {
        const u = r.card ? byCardId.get(r.card.id) : null
        if (!u) return r
        touchedKeys.add(r.key)
        const poolQty = Math.max(0, Math.min(6, u.poolQty))
        let deckQty = Math.max(0, Math.min(6, u.deckQty))
        if (deckQty > poolQty) deckQty = poolQty
        const next = {
          ...r,
          poolQty,
          deckQty,
          extracted: {
            ...r.extracted,
            poolQty,
            deckQty,
            poolQtyConfidence: u.poolQtyConfidence || r.extracted.poolQtyConfidence,
            deckQtyConfidence: u.deckQtyConfidence || r.extracted.deckQtyConfidence,
          },
        }
        return next
      })
      // Drop dismissed-anomaly keys whose row got replaced — keep only
      // dismissals on rows we didn't touch.
      const dismissedAnomalyKeys = state.dismissedAnomalyKeys.filter((k) => {
        // Anomaly keys typically embed the row key (e.g. "lowConf:pool:row-3")
        for (const tk of touchedKeys) {
          if (k.includes(tk)) return false
        }
        return true
      })
      return { ...state, resolvedRows, dismissedAnomalyKeys }
    }
    case 'SET_ACTIVE_LEADER':
      // Setting an active leader sets that row's deckQty=1 and forces all
      // other leader rows back to deckQty=0 — exactly one leader is active
      // at a time. Without this the PLAYED-column number for a clicked
      // leader wouldn't change visibly (only activeLeaderId does), which
      // looks like the click did nothing.
      return {
        ...state,
        activeLeaderId: action.cardId,
        resolvedRows: state.resolvedRows.map((r) =>
          r.card?.isLeader
            ? { ...r, deckQty: r.card.id === action.cardId ? 1 : 0 }
            : r,
        ),
      }
    case 'SET_ACTIVE_BASE':
      return {
        ...state,
        activeBaseId: action.cardId,
        resolvedRows: state.resolvedRows.map((r) =>
          r.card?.isBase
            ? { ...r, deckQty: r.card.id === action.cardId ? 1 : 0 }
            : r,
        ),
      }
    case 'SET_TITLE':
      return { ...state, title: action.title.slice(0, 80), isTitleDefault: false }
    case 'SUBMIT_START':
      return { ...state, phase: 'submitting', error: null }
    case 'SUBMIT_SUCCESS':
      return { ...state, phase: 'done', shareId: action.shareId }
    case 'SUBMIT_FAILURE':
      return { ...state, phase: 'confirming', error: action.error }
    case 'SET_VIEW_FILTER':
      return { ...state, viewFilter: action.filter }
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.mode }
    case 'DISMISS_ANOMALY':
      // Idempotent — adding the same key twice is a no-op.
      if (state.dismissedAnomalyKeys.includes(action.anomalyKey)) return state
      return { ...state, dismissedAnomalyKeys: [...state.dismissedAnomalyKeys, action.anomalyKey] }
    case 'HYDRATE_IMAGES':
      // Async hydration after mount — only if state.images is empty (i.e.,
      // they were dropped from a prior session). Don't clobber freshly
      // uploaded images.
      if (state.images.length > 0) return state
      return { ...state, images: action.images }
    case 'RESET':
      // previewUrls are now data URLs (no-op revoke), but keep the call for safety
      state.images.forEach((img) => URL.revokeObjectURL(img.previewUrl))
      return INITIAL_STATE
    case 'RESTORE': {
      // Transient phases ('extracting', 'submitting') had a pending API call
      // that didn't survive the refresh. Park them at their resting phase so
      // the UI isn't stuck on a spinner.
      const restored = { ...INITIAL_STATE, ...action.state, error: null, shareId: null }
      if (restored.phase === 'extracting') restored.phase = 'uploading'
      if (restored.phase === 'submitting') restored.phase = 'confirming'
      if (restored.phase === 'error') restored.phase = restored.images.length > 0 ? 'uploading' : 'idle'
      if (restored.phase === 'done') restored.phase = 'idle' // shouldn't happen — clearPersisted runs on 'done'
      return restored
    }
    default:
      return state
  }
}

// === Validation (derived) ===

export interface Validation {
  valid: boolean
  poolCount: number
  poolTarget: number
  deckCount: number
  /** Minimum legal deck size for sealed (sets the target for the X/30 readout) */
  deckTarget: number
  hasLeader: boolean
  hasBase: boolean
  unresolvedCount: number
  errors: string[]
}

const POOL_TARGET = 96
const DECK_TARGET = 30

function deriveValidation(state: ImportPoolState): Validation {
  const errors: string[] = []
  let poolCount = 0
  let deckCount = 0
  let unresolvedCount = 0

  for (const row of state.resolvedRows) {
    if (!row.card) {
      unresolvedCount++
      continue
    }
    poolCount += row.poolQty
    // Deck count excludes leader + base — those are separate from the
    // 30+ deck per SWU rules. Step 2 and Step 3 should agree on this
    // number ("Deck 29/30" means 29 actual non-LB deck cards).
    if (!row.card.isLeader && !row.card.isBase) {
      deckCount += row.deckQty
    }
    if (row.deckQty > row.poolQty) {
      errors.push(`${row.card.name}: deck quantity exceeds pool quantity`)
    }
  }

  if (poolCount !== POOL_TARGET)
    errors.push(`Pool must total ${POOL_TARGET} cards (currently ${poolCount})`)
  if (deckCount < DECK_TARGET)
    errors.push(`Deck must include at least ${DECK_TARGET} cards (currently ${deckCount})`)
  const hasLeader = !!state.activeLeaderId
  const hasBase = !!state.activeBaseId
  if (!hasLeader) errors.push('Select an active leader')
  if (!hasBase) errors.push('Select an active base')
  if (unresolvedCount > 0) errors.push(`${unresolvedCount} unresolved card${unresolvedCount === 1 ? '' : 's'}`)

  return {
    valid: errors.length === 0,
    poolCount,
    poolTarget: POOL_TARGET,
    deckCount,
    deckTarget: DECK_TARGET,
    hasLeader,
    hasBase,
    unresolvedCount,
    errors,
  }
}

// === Persistence ===
//
// Wizard state survives page refresh via localStorage. Loaded synchronously
// via the useReducer lazy initializer at mount, so the very first render
// already has the restored state — no race between dispatch and save effect.
// previewUrl is a data URL so images survive serialization without blob handling.

/**
 * Slim persistence shape — embedded card objects (with imageUrl, aspects,
 * etc.) are dropped; we persist only IDs. On load, full card data is
 * reconstructed from getCachedCards(setCode). Cuts persist size from
 * ~1.5MB to ~1.2MB (most of which is now just the base64 images).
 */
interface SlimRow {
  key: string
  cardId: string | null
  extracted: ResolvedRow['extracted']
  candidateIds: string[]
  poolQty: number
  deckQty: number
  confidence: ResolvedRow['confidence']
}

interface SlimPersisted {
  phase: Phase
  images: ProcessedImage[]
  setCode: string | null
  header: ExtractedHeader | null
  rows: SlimRow[]
  warnings: string[]
  activeLeaderId: string | null
  activeBaseId: string | null
  title: string
  viewFilter: 'all' | 'pool' | 'deck'
  viewMode: 'table' | 'grid'
  /** Optional for back-compat with state persisted before this field existed. */
  dismissedAnomalyKeys?: string[]
  /** Section-level state from the extraction. Without these, refreshing on
   *  Step 2 would lose section anomalies and the source-image crop bounds. */
  sectionGaps?: SectionGap[]
  sectionBounds?: SectionBounds[]
  sessionId?: string | null
}

function persistedShape(state: ImportPoolState): SlimPersisted {
  return {
    phase: state.phase,
    // Images are persisted to IndexedDB by saveImagesToIdb(), NOT to
    // localStorage — they're 1–2MB each and used to fill localStorage's
    // 5–10MB quota, which forced a fallback that dropped them entirely.
    // Always empty here.
    images: [],
    setCode: state.extraction?.header.setCode || null,
    header: state.extraction?.header || null,
    rows: state.resolvedRows.map((r) => ({
      key: r.key,
      cardId: r.card?.id || null,
      extracted: r.extracted,
      candidateIds: r.candidates.map((c) => c.id),
      poolQty: r.poolQty,
      deckQty: r.deckQty,
      confidence: r.confidence,
    })),
    warnings: state.warnings,
    activeLeaderId: state.activeLeaderId,
    activeBaseId: state.activeBaseId,
    title: state.title,
    viewFilter: state.viewFilter,
    viewMode: state.viewMode,
    dismissedAnomalyKeys: state.dismissedAnomalyKeys,
    sectionGaps: state.sectionGaps,
    sectionBounds: state.sectionBounds,
    sessionId: state.sessionId,
  }
}

/** Look up a card by its CMS uuid in the cached set data, returning the
 *  MatchedCard projection (without bloat we don't store). */
function lookupCardById(setCode: string, cardId: string): MatchedCard | null {
  if (typeof window === 'undefined') return null
  const all = getCachedCards(setCode) || []
  const found = all.find((c: any) => c.id === cardId)
  if (!found) return null
  return {
    id: found.id,
    cardId: found.cardId,
    name: found.name,
    subtitle: found.subtitle,
    type: found.type,
    aspects: found.aspects || [],
    imageUrl: found.imageUrl,
    isLeader: !!found.isLeader,
    isBase: !!found.isBase,
  }
}

/** Rehydrate slim-persisted shape into the full ImportPoolState shape.
 *  Looks up full card data from the cached card list to avoid persisting it. */
function hydrate(slim: SlimPersisted): Partial<ImportPoolState> {
  const setCode = slim.setCode || ''
  const lookup = (id: string | null): MatchedCard | null =>
    id && setCode ? lookupCardById(setCode, id) : null

  const resolvedRows: ResolvedRow[] = (slim.rows || []).map((sr) => ({
    key: sr.key,
    card: lookup(sr.cardId),
    extracted: sr.extracted,
    candidates: (sr.candidateIds || []).map((id) => lookup(id)).filter((c): c is MatchedCard => !!c),
    poolQty: sr.poolQty,
    deckQty: sr.deckQty,
    confidence: sr.confidence,
  }))

  const extraction: ExtractResponse | null = slim.header
    ? {
        header: slim.header,
        rows: [],
        warnings: slim.warnings,
      }
    : null

  return {
    phase: slim.phase,
    images: slim.images || [],
    extraction,
    resolvedRows,
    activeLeaderId: slim.activeLeaderId,
    activeBaseId: slim.activeBaseId,
    title: slim.title || '',
    warnings: slim.warnings || [],
    viewFilter: slim.viewFilter ?? 'pool',
    viewMode: slim.viewMode ?? 'table',
    dismissedAnomalyKeys: slim.dismissedAnomalyKeys ?? [],
    sectionGaps: slim.sectionGaps ?? [],
    sectionBounds: slim.sectionBounds ?? [],
    sessionId: slim.sessionId ?? null,
  }
}

function clearPersisted() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  // Fire-and-forget — IndexedDB clear is async but we don't block on it
  idbClearImages().catch(() => {})
}

function savePersisted(state: ImportPoolState) {
  if (typeof window === 'undefined') return
  if (state.phase === 'done') return
  if (state.phase === 'idle' && state.images.length === 0 && state.extraction === null) {
    return
  }

  const slim = persistedShape(state)

  // localStorage carries everything BUT images. Under normal conditions
  // slim is ~50-200KB. Quota errors here usually mean the localStorage
  // origin is full from other apps/tabs, so we degrade gracefully:
  // try slim → try minimal → silently skip. Persistence is best-effort;
  // wizard works fine without it (user just can't refresh mid-flow).
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
  } catch (err) {
    // Try removing our own key first in case stale data is the cause,
    // then retry with the minimal shape.
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    try {
      const minimal: Partial<SlimPersisted> = {
        phase: slim.phase,
        images: [],
        setCode: slim.setCode,
        header: null,
        rows: slim.rows,
        warnings: [],
        activeLeaderId: slim.activeLeaderId,
        activeBaseId: slim.activeBaseId,
        title: slim.title,
        viewFilter: slim.viewFilter,
        viewMode: slim.viewMode,
        dismissedAnomalyKeys: slim.dismissedAnomalyKeys,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal))
    } catch {
      // Quota exhausted even for minimal. Skip persistence this tick —
      // the wizard still works without it. Log once at info level so
      // it's discoverable but doesn't spam the console as red errors.
      console.info('[ImportPool] localStorage quota exhausted; persist skipped this tick')
    }
  }

  // Images go to IndexedDB (way more space, asynchronous). We don't
  // await — fire and forget. Read path is async too.
  idbSaveImages(state.images).catch((err) => {
    console.warn('[ImportPool] IDB image save failed', err)
  })
}

function lazyInit(): ImportPoolState {
  if (typeof window === 'undefined') return INITIAL_STATE
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch (err) {
    console.warn('[ImportPool] localStorage.getItem threw — starting fresh', err)
    return INITIAL_STATE
  }
  if (!raw) {
    console.info('[ImportPool] no persisted state — starting fresh')
    return INITIAL_STATE
  }
  console.info(`[ImportPool] loading persisted state (${raw.length} chars)`)
  let persisted: SlimPersisted
  try {
    persisted = JSON.parse(raw)
  } catch (err) {
    console.warn('[ImportPool] persisted state is malformed JSON — starting fresh', err)
    return INITIAL_STATE
  }
  console.info(`[ImportPool] persisted phase=${persisted.phase}, images=${persisted.images?.length || 0}, rows=${persisted.rows?.length || 0}`)
  // Hydrate slim shape back to full ImportPoolState by looking up cards from cache
  const hydrated = hydrate(persisted)
  // Park transient phases at their resting phase so a refresh mid-API-call
  // doesn't leave the UI stuck on a spinner.
  let phase = (hydrated.phase || persisted.phase) as Phase
  if (phase === 'extracting') phase = 'uploading'
  else if (phase === 'submitting') phase = 'confirming'
  else if (phase === 'error') phase = (persisted.images?.length || 0) > 0 ? 'uploading' : 'idle'
  else if (phase === 'done') phase = 'idle'
  if (!['idle', 'uploading', 'resolving', 'confirming'].includes(phase)) {
    phase = 'idle'
  }
  return {
    ...INITIAL_STATE,
    ...hydrated,
    phase,
    error: null,
    shareId: null,
  }
}

// === Hook ===

export function useImportPool() {
  const [state, dispatch] = useReducer(reducer, undefined, lazyInit)

  // Persist on every state change. No "have I restored yet" guard needed —
  // lazy init already populated state on the very first render.
  // Outer try/catch is belt-and-suspenders: savePersisted has its own
  // fallback chain, but if anything ever throws unexpectedly here it must
  // not propagate to the React error boundary.
  useEffect(() => {
    try {
      if (state.phase === 'done') {
        clearPersisted()
      } else {
        savePersisted(state)
      }
    } catch (err) {
      console.error('[ImportPool] persistence effect threw', err)
    }
  }, [state])

  // On mount only: async-load the persisted images from IndexedDB. lazyInit
  // already gave us all the non-image state synchronously, so the wizard
  // renders immediately; images stream in once the IDB read returns. The
  // HYDRATE_IMAGES reducer is a no-op if state.images already has entries
  // (e.g. user uploaded before hydration completed).
  //
  // Fresh-start guard: if lazyInit returned the empty INITIAL_STATE (no
  // localStorage session), then any images still sitting in IDB are
  // leftovers from a prior wizard run that completed or was abandoned.
  // Hydrating them into a fresh wizard meant the user saw "previous"
  // thumbnails AND any new upload could be silently dropped because
  // UploadStep.handleFileChange's `state.images.length >= 2` check would
  // hit on the hydrated leftovers. Clear instead of hydrate.
  useEffect(() => {
    let cancelled = false
    const isFreshStart =
      state.phase === 'idle' && state.images.length === 0 && state.extraction === null
    if (isFreshStart) {
      idbClearImages().catch(() => {})
      return () => {
        cancelled = true
      }
    }
    idbLoadImages()
      .then((images) => {
        if (cancelled || images.length === 0) return
        dispatch({ type: 'HYDRATE_IMAGES', images })
      })
      .catch(() => {
        // Best-effort — failures here just mean the user has to re-upload.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const validation = useMemo(() => deriveValidation(state), [state])

  const addImage = useCallback(async (file: File) => {
    try {
      // 1. Read bytes + dimensions client-side for the preview thumbnail.
      const processed = await resizeImage(file)

      // 2. Upload immediately to the server so /api/import/extract can
      //    reference it by key instead of base64'ing it back over JSON
      //    (Next.js's request.json() truncates at 10MB; two iPhone
      //    photos always overflow). Multipart on this single-photo
      //    endpoint sidesteps the JSON limit entirely.
      const form = new FormData()
      form.append('photo', file, file.name)
      const upRes = await fetch('/api/import/upload-photo', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const upPayload = await upRes.json()
      const upBody = upPayload.data ?? upPayload
      if (!upRes.ok) {
        throw new Error(upBody?.error || upPayload.message || 'Photo upload failed')
      }
      processed.photoKey = upBody.key

      // For HEIC uploads the server converts to JPEG and returns the converted
      // bytes — replace the (unrenderable in Chrome) HEIC previewUrl with the
      // JPEG one so the thumbnail and source-image modal both render. This
      // also means the source-modal's natural width/height match what the
      // server sent to Claude, so section bounds line up correctly.
      if (upBody.previewDataUrl && typeof upBody.previewDataUrl === 'string') {
        processed.previewUrl = upBody.previewDataUrl
        processed.mediaType = (upBody.mediaType || processed.mediaType) as ProcessedImage['mediaType']
        processed.sizeBytes = upBody.sizeBytes ?? processed.sizeBytes
      }

      dispatch({ type: 'ADD_IMAGE', image: processed })
    } catch (err) {
      dispatch({
        type: 'EXTRACTION_FAILURE',
        error: { code: 'IMAGE_PREP_FAILED', message: (err as Error).message },
      })
    }
  }, [])

  const removeImage = useCallback((index: number) => {
    URL.revokeObjectURL(state.images[index]?.previewUrl)
    dispatch({ type: 'REMOVE_IMAGE', index })
  }, [state.images])

  const runExtraction = useCallback(async () => {
    if (state.images.length === 0) return
    dispatch({ type: 'EXTRACTION_START' })
    try {
      // Prefer photoKeys (R2/server-stored) when every image has one —
      // bypasses the 10MB JSON body limit. Fall back to inline images for
      // older sessions whose uploads predate the upload-photo endpoint.
      const allHaveKeys = state.images.length > 0 && state.images.every((img) => !!img.photoKey)
      const response = await fetch('/api/import/extract', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          allHaveKeys
            ? { photoKeys: state.images.map((img) => img.photoKey) }
            : { images: state.images.map((img) => ({ data: img.data, mediaType: img.mediaType })) },
        ),
      })
      const payload = await response.json()
      // jsonResponse wraps body as { success, data, message }; unwrap to get error/code
      const body = payload.data ?? payload
      if (!response.ok) {
        dispatch({
          type: 'EXTRACTION_FAILURE',
          error: {
            code: body?.code || 'EXTRACTION_FAILED',
            message: body?.error || payload.message || 'Extraction failed',
            details: body,
          },
        })
        return
      }
      dispatch({ type: 'EXTRACTION_SUCCESS', response: body as ExtractResponse })
    } catch (err) {
      dispatch({
        type: 'EXTRACTION_FAILURE',
        error: { code: 'NETWORK_ERROR', message: (err as Error).message },
      })
    }
  }, [state.images])

  const setRowQty = useCallback((key: string, field: 'poolQty' | 'deckQty', value: number) => {
    dispatch({ type: 'SET_ROW_QTY', key, field, value })
  }, [])

  const replaceRowCard = useCallback((key: string, card: MatchedCard) => {
    dispatch({ type: 'REPLACE_ROW_CARD', key, card })
  }, [])

  const setActiveLeader = useCallback((cardId: string) => {
    dispatch({ type: 'SET_ACTIVE_LEADER', cardId })
  }, [])

  const setActiveBase = useCallback((cardId: string) => {
    dispatch({ type: 'SET_ACTIVE_BASE', cardId })
  }, [])

  const setTitle = useCallback((title: string) => {
    dispatch({ type: 'SET_TITLE', title })
  }, [])

  const goToConfirm = useCallback(() => {
    if (validation.valid) dispatch({ type: 'GO_TO_CONFIRM' })
  }, [validation.valid])

  const goBack = useCallback(() => dispatch({ type: 'GO_BACK' }), [])
  const goToUpload = useCallback(() => dispatch({ type: 'GO_TO_UPLOAD' }), [])

  const submit = useCallback(async () => {
    if (!state.extraction || !state.activeLeaderId || !state.activeBaseId) return
    dispatch({ type: 'SUBMIT_START' })
    try {
      const response = await fetch('/api/import/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setCode: state.extraction.header.setCode,
          // Only send rows that are actually in the pool (poolQty >= 1).
          // The wizard tracks every card in the catalog (~264 rows) so the
          // user can bump qty up on misses, but those non-pool rows aren't
          // part of what gets created. The API caps at 200; without this
          // filter we exceed it on every set.
          resolvedRows: state.resolvedRows
            .filter((r) => r.card && r.poolQty >= 1)
            .map((r) => ({
              cardId: r.card!.id,
              poolQty: r.poolQty,
              deckQty: r.deckQty,
            })),
          activeLeaderId: state.activeLeaderId,
          activeBaseId: state.activeBaseId,
          title: state.title,
          isDefaultName: state.isTitleDefault,
          // Eval pairing — server uses this to drop the user's final
          // corrections into the same /tmp/eval-captures/<sessionId>/ dir
          // that the extract route wrote photos into.
          sessionId: state.sessionId,
        }),
      })
      const payload = await response.json()
      const body = payload.data ?? payload
      if (!response.ok) {
        dispatch({
          type: 'SUBMIT_FAILURE',
          error: {
            code: body?.code || body?.error || 'SUBMIT_FAILED',
            message:
              (typeof body?.error === 'string' ? body.error : null) ||
              payload.message ||
              'Failed to create pool',
            details: body?.details,
          },
        })
        return
      }
      dispatch({ type: 'SUBMIT_SUCCESS', shareId: body.shareId })
    } catch (err) {
      dispatch({
        type: 'SUBMIT_FAILURE',
        error: { code: 'NETWORK_ERROR', message: (err as Error).message },
      })
    }
  }, [state])

  const reset = useCallback(() => {
    clearPersisted()
    dispatch({ type: 'RESET' })
  }, [])

  const setViewFilter = useCallback((filter: 'all' | 'pool' | 'deck') => {
    dispatch({ type: 'SET_VIEW_FILTER', filter })
  }, [])

  const setViewMode = useCallback((mode: 'table' | 'grid') => {
    dispatch({ type: 'SET_VIEW_MODE', mode })
  }, [])

  const dismissAnomaly = useCallback((anomalyKey: string) => {
    dispatch({ type: 'DISMISS_ANOMALY', anomalyKey })
  }, [])

  /** Re-extract a single section's cells via /api/import/re-extract-section.
   *  Resolves with `{ rowsReplaced, elapsedMs }` on success. The caller can
   *  use these for toast messaging. Throws on failure. */
  const reExtractSection = useCallback(
    async (sectionName: string): Promise<{ rowsReplaced: number; elapsedMs: number }> => {
      if (!state.extraction) throw new Error('No extraction in progress')
      const photoKeys = state.images.map((img) => img.photoKey).filter((k): k is string => !!k)
      if (photoKeys.length === 0) {
        throw new Error('Source photos missing — cannot re-extract')
      }
      const res = await fetch('/api/import/re-extract-section', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoKeys,
          sectionName,
          setCode: state.extraction.header.setCode,
        }),
      })
      const payload = await res.json()
      const body = payload.data ?? payload
      if (!res.ok) {
        throw new Error(body?.error || payload.message || 'Re-extract failed')
      }
      const updates = (body.rows || []) as Array<{
        cardId: string
        poolQty: number
        deckQty: number
        poolQtyConfidence?: 'high' | 'medium' | 'low'
        deckQtyConfidence?: 'high' | 'medium' | 'low'
      }>
      dispatch({ type: 'REPLACE_SECTION_ROWS', updates })
      return { rowsReplaced: updates.length, elapsedMs: body.elapsedMs || 0 }
    },
    [state.extraction, state.images],
  )

  return {
    state,
    validation,
    addImage,
    removeImage,
    runExtraction,
    setRowQty,
    replaceRowCard,
    setActiveLeader,
    setActiveBase,
    setTitle,
    goToConfirm,
    goBack,
    goToUpload,
    submit,
    reset,
    setViewFilter,
    setViewMode,
    dismissAnomaly,
    reExtractSection,
  }
}
