// Utility functions
import { customAlphabet } from 'nanoid'

// Alphanumeric only (no dashes or underscores)
const alphanumericNanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  10
)

export interface ApiResponse<T = unknown> {
  success: boolean
  data: T | null
  message: string | null
}

/**
 * Generate a short, URL-safe alphanumeric ID for sharing
 * @param length - Length of ID (default: 10 for better collision resistance)
 * @returns Shareable ID
 */
export function generateShareId(length: number = 10): string {
  return alphanumericNanoid(length)
}

/**
 * Create a standardized API response
 * @param data - Response data
 * @param status - HTTP status code
 * @param message - Optional message
 * @returns HTTP response
 */
export function jsonResponse<T>(data: T, status: number = 200, message: string | null = null): Response {
  return new Response(
    JSON.stringify({
      success: status >= 200 && status < 300,
      data,
      message,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
}

/**
 * Create an error response
 * @param message - Error message
 * @param status - HTTP status code (default: 400)
 * @returns HTTP error response
 */
export function errorResponse(message: string, status: number = 400): Response {
  return jsonResponse(null, status, message)
}

/**
 * Handle API route errors
 * @param error - Error object (accepts unknown — catch blocks surface unknown)
 * @returns Error response
 */
export function handleApiError(error: unknown): Response {
  console.error('API Error:', error)

  if (!(error instanceof Error)) {
    return errorResponse('Internal server error', 500)
  }

  if (error.message === 'Unauthorized') {
    return errorResponse('Authentication required', 401)
  }

  if (error.message === 'Beta access required') {
    return errorResponse('Beta access required', 403)
  }

  if (error.message === 'Admin access required') {
    return errorResponse('Admin access required', 403)
  }

  if (error.message === 'Full stats access required') {
    return errorResponse('Full stats access required', 403)
  }

  if (error.message.includes('duplicate key')) {
    return errorResponse('Resource already exists', 409)
  }

  if (error.message.includes('not found')) {
    return errorResponse('Resource not found', 404)
  }

  return errorResponse(error.message || 'Internal server error', 500)
}

/**
 * Parse request body as JSON
 * @param request - HTTP request
 * @returns Parsed JSON body
 */
export async function parseBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    // Next.js Request already has .json() method
    return await request.json() as T
  } catch (err) {
    // Surface the underlying reason so failures aren't always opaque.
    // Common causes: body truncated by upstream proxy (413), body never
    // sent, or genuine syntax error.
    const cl = request.headers?.get?.('content-length') || 'unknown'
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON body (content-length=${cl}, parser: ${detail})`)
  }
}

/**
 * Validate required fields in an object
 * @param obj - Object to validate
 * @param requiredFields - Array of required field names
 * @throws Error if any required field is missing
 */
export function validateRequired(obj: Record<string, unknown>, requiredFields: string[]): void {
  const missing = requiredFields.filter((field) => !(field in obj))
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`)
  }
}

// Set order for determining consecutive sets
const SET_ORDER: Record<string, number> = {
  'SOR': 1, 'SHD': 2, 'TWI': 3,
  'JTL': 4, 'LOF': 5, 'SEC': 6,
  'LAW': 7,
}

/**
 * Format set codes as range if all consecutive, otherwise as list
 * e.g., ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC'] → "SOR-SEC" (all consecutive)
 * e.g., ['SOR', 'SHD', 'JTL', 'LOF'] → "SOR, SHD, JTL, LOF" (not all consecutive)
 */
export function formatSetCodeRange(setCodes: string[]): string {
  if (setCodes.length === 0) return ''
  if (setCodes.length === 1) return setCodes[0] ?? ''

  // Sort by set order
  const sorted = [...setCodes].sort((a, b) => (SET_ORDER[a] || 99) - (SET_ORDER[b] || 99))

  // Check if all consecutive
  let allConsecutive = true
  for (let i = 1; i < sorted.length; i++) {
    const prevOrder = SET_ORDER[sorted[i - 1] ?? ''] || 99
    const currOrder = SET_ORDER[sorted[i] ?? ''] || 99
    if (currOrder !== prevOrder + 1) {
      allConsecutive = false
      break
    }
  }

  if (allConsecutive) {
    return `${sorted[0]}-${sorted[sorted.length - 1]}`
  } else {
    return sorted.join(', ')
  }
}
