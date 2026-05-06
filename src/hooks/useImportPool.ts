// @ts-nocheck
/**
 * useImportPool — wizard state machine for the Import Pool feature (U6).
 *
 * useReducer over a discriminated-union state. One action per exposed verb.
 * Phases: idle → uploading → extracting → resolving → confirming → submitting
 *         → done | error
 *
 * The hook coordinates image upload, extraction (POST /api/import-pool/extract),
 * row edits, and submission (POST /api/import-pool/create). Validation runs
 * continuously as a derived selector.
 *
 * See docs/plans/2026-05-05-001-feat-import-pool-spike-plan.md U6.
 */

import { useReducer, useCallback, useMemo, useEffect, useRef } from 'react'
import { resizeImage, type ProcessedImage } from '../services/importPool/imagePrep'

const STORAGE_KEY = 'import-pool-wizard-v1'

// === Types ===

export interface ExtractedRow {
  name: string
  type: 'Leader' | 'Base' | 'Unit' | 'Event' | 'Upgrade'
  subtitle: string | null
  poolQty: number
  deckQty: number
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
  shareId: string | null
  warnings: string[]
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
  shareId: null,
  warnings: [],
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
  | { type: 'GO_BACK' }
  | { type: 'SET_ROW_QTY'; key: string; field: 'poolQty' | 'deckQty'; value: number }
  | { type: 'REPLACE_ROW_CARD'; key: string; card: MatchedCard }
  | { type: 'SET_ACTIVE_LEADER'; cardId: string }
  | { type: 'SET_ACTIVE_BASE'; cardId: string }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; shareId: string }
  | { type: 'SUBMIT_FAILURE'; error: ImportPoolState['error'] }
  | { type: 'RESET' }
  | { type: 'RESTORE'; state: Partial<ImportPoolState> }

function reducer(state: ImportPoolState, action: Action): ImportPoolState {
  switch (action.type) {
    case 'ADD_IMAGE':
      return {
        ...state,
        // Adding/removing images during/after extraction discards prior extraction
        // per scope: re-upload triggers a fresh CV pass.
        ...(state.extraction
          ? { extraction: null, resolvedRows: [], activeLeaderId: null, activeBaseId: null, title: '', warnings: [] }
          : {}),
        phase: 'uploading',
        images: [...state.images, action.image],
        error: null,
      }
    case 'REMOVE_IMAGE': {
      const images = state.images.filter((_, i) => i !== action.index)
      return {
        ...state,
        ...(state.extraction
          ? { extraction: null, resolvedRows: [], activeLeaderId: null, activeBaseId: null, title: '', warnings: [] }
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

      // Auto-compose default title.
      const titleParts: string[] = []
      if (header.eventName) titleParts.push(header.eventName)
      if (header.eventDate) titleParts.push(header.eventDate)
      if (header.playerName) titleParts.push(header.playerName)
      if (header.leader.name) {
        const lb = header.base.name
          ? `${header.leader.name} / ${header.base.name}`
          : header.leader.name
        titleParts.push(lb)
      }
      const title = titleParts.join(' · ').slice(0, 80)

      return {
        ...state,
        phase: 'resolving',
        extraction: action.response,
        resolvedRows,
        activeLeaderId,
        activeBaseId,
        title,
        warnings: action.response.warnings || [],
        error: null,
      }
    }
    case 'EXTRACTION_FAILURE':
      return { ...state, phase: 'error', error: action.error }
    case 'GO_TO_RESOLVE':
      return { ...state, phase: 'resolving', error: null }
    case 'GO_TO_CONFIRM':
      return { ...state, phase: 'confirming', error: null }
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
    case 'SET_ACTIVE_LEADER':
      return { ...state, activeLeaderId: action.cardId }
    case 'SET_ACTIVE_BASE':
      return { ...state, activeBaseId: action.cardId }
    case 'SET_TITLE':
      return { ...state, title: action.title.slice(0, 80) }
    case 'SUBMIT_START':
      return { ...state, phase: 'submitting', error: null }
    case 'SUBMIT_SUCCESS':
      return { ...state, phase: 'done', shareId: action.shareId }
    case 'SUBMIT_FAILURE':
      return { ...state, phase: 'confirming', error: action.error }
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
  deckCount: number
  hasLeader: boolean
  hasBase: boolean
  unresolvedCount: number
  errors: string[]
}

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
    deckCount += row.deckQty
    if (row.deckQty > row.poolQty) {
      errors.push(`${row.card.name}: deck quantity exceeds pool quantity`)
    }
  }

  if (poolCount !== 96) errors.push(`Pool must total 96 cards (currently ${poolCount})`)
  const hasLeader = !!state.activeLeaderId
  const hasBase = !!state.activeBaseId
  if (!hasLeader) errors.push('Select an active leader')
  if (!hasBase) errors.push('Select an active base')
  if (unresolvedCount > 0) errors.push(`${unresolvedCount} unresolved card${unresolvedCount === 1 ? '' : 's'}`)

  return {
    valid: errors.length === 0,
    poolCount,
    deckCount,
    hasLeader,
    hasBase,
    unresolvedCount,
    errors,
  }
}

// === Persistence ===
//
// Wizard state survives page refresh via localStorage. Set after first mount
// (not as a useReducer lazy init) to avoid SSR hydration mismatch. previewUrl
// is a data URL so the images survive serialization without any blob handling.

function persistedShape(state: ImportPoolState) {
  return {
    phase: state.phase,
    images: state.images,
    extraction: state.extraction,
    resolvedRows: state.resolvedRows,
    activeLeaderId: state.activeLeaderId,
    activeBaseId: state.activeBaseId,
    title: state.title,
    warnings: state.warnings,
  }
}

function loadPersisted(): Partial<ImportPoolState> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function clearPersisted() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

function savePersisted(state: ImportPoolState) {
  if (typeof window === 'undefined') return

  // Critical: never clear localStorage from this path. On mount, this effect
  // fires with state === INITIAL_STATE (the pending RESTORE dispatch hasn't
  // applied yet) — a clear here would wipe valid persisted data before
  // restoration completes. Clearing only happens on explicit reset() or
  // after successful submit.
  if (state.phase === 'done') return
  if (state.phase === 'idle' && state.images.length === 0 && state.extraction === null) {
    return
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedShape(state)))
  } catch (err) {
    // Most likely quota exceeded with large base64 images. Non-fatal — the
    // wizard still works in-session, just won't survive refresh.
    console.warn('Import Pool: failed to persist wizard state', err)
  }
}

// === Hook ===

export function useImportPool() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const restoredRef = useRef(false)

  // Restore on first mount (after hydration). Skips if no persisted state.
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const persisted = loadPersisted()
    if (persisted && (persisted.images?.length || persisted.extraction)) {
      dispatch({ type: 'RESTORE', state: persisted })
    }
  }, [])

  // Persist on every state change (after restore has run).
  useEffect(() => {
    if (!restoredRef.current) return
    if (state.phase === 'done') {
      clearPersisted()
    } else {
      savePersisted(state)
    }
  }, [state])

  const validation = useMemo(() => deriveValidation(state), [state])

  const addImage = useCallback(async (file: File) => {
    try {
      const processed = await resizeImage(file)
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
      const response = await fetch('/api/import-pool/extract', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: state.images.map((img) => ({ data: img.data, mediaType: img.mediaType })),
        }),
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

  const submit = useCallback(async () => {
    if (!state.extraction || !state.activeLeaderId || !state.activeBaseId) return
    dispatch({ type: 'SUBMIT_START' })
    try {
      const response = await fetch('/api/import-pool/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setCode: state.extraction.header.setCode,
          resolvedRows: state.resolvedRows
            .filter((r) => r.card)
            .map((r) => ({
              cardId: r.card!.id,
              poolQty: r.poolQty,
              deckQty: r.deckQty,
            })),
          activeLeaderId: state.activeLeaderId,
          activeBaseId: state.activeBaseId,
          title: state.title,
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
    submit,
    reset,
  }
}
