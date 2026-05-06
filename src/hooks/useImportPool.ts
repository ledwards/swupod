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

import { useReducer, useCallback, useMemo } from 'react'
import { resizeImage, type ProcessedImage } from '../services/importPool/imagePrep'

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
      // Revoke any preview URLs to avoid leaks
      state.images.forEach((img) => URL.revokeObjectURL(img.previewUrl))
      return INITIAL_STATE
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

// === Hook ===

export function useImportPool() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)

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

  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

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
