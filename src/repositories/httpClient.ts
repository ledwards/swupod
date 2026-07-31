// @ts-nocheck
/**
 * HTTP Client
 *
 * Standardized HTTP client for API calls with consistent error handling.
 * Replaces the repeated fetch pattern across draftApi.js, poolApi.js, etc.
 *
 * All methods:
 * - Include credentials (cookies) by default
 * - Parse JSON responses
 * - Extract data.data from response (API convention)
 * - Throw errors with server message on non-ok responses
 */

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] || '/api'

interface RequestOptions extends Omit<RequestInit, 'body' | 'method'> {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  extractData?: boolean
}

/**
 * HTTP error with status code and server message
 */
export class HttpError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data: unknown = null) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.data = data
  }
}

/**
 * Pull the human-readable message out of an API error body.
 *
 * The API has TWO error shapes and both must be understood:
 *   errorResponse('msg', 403)          -> { success: false, data: null,        message: 'msg' }
 *   jsonResponse({ error: 'msg' }, 403) -> { success: false, data: { error: 'msg' }, message: null }
 *
 * Reading only `.message` (the old behaviour) swallowed every route that uses
 * the second shape — e.g. the Friends of the Pod gate on Competitive Sealed /
 * Competitive Draft creation, which surfaced as a generic "Try Again" screen.
 *
 * @param body - Parsed JSON error body (any shape)
 * @param fallback - Message to use when the body carries none
 */
export function extractApiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback
  const outer = body as { message?: unknown; error?: unknown; data?: unknown }
  const inner = (outer.data && typeof outer.data === 'object' ? outer.data : {}) as {
    message?: unknown
    error?: unknown
  }
  const candidates = [outer.message, outer.error, inner.error, inner.message]
  const found = candidates.find(c => typeof c === 'string' && c.trim().length > 0)
  return (found as string) || fallback
}

/**
 * Make an HTTP request with standardized error handling
 *
 * @param url - URL path (will be prefixed with API_BASE)
 * @param options - Fetch options
 * @returns Response data
 * @throws {HttpError} On non-ok response
 */
async function request<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    extractData = true,
    ...rest
  } = options

  const fetchOptions: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      ...headers,
    },
    ...rest,
  }

  // Add JSON content-type and body for POST/PUT/PATCH
  if (body !== undefined) {
    (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json'
    fetchOptions.body = JSON.stringify(body)
  }

  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`

  const response = await fetch(fullUrl, fetchOptions)

  // Handle non-ok responses
  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`
    let errorData: unknown = null

    try {
      errorData = await response.json()
      errorMessage = extractApiErrorMessage(errorData, errorMessage)
    } catch {
      // Response wasn't JSON, use status text
      errorMessage = response.statusText || errorMessage
    }

    throw new HttpError(errorMessage, response.status, errorData)
  }

  // Parse JSON response
  const data = await response.json()

  // Extract nested data if API uses { data: ... } convention
  if (extractData && data && typeof data === 'object' && 'data' in data) {
    return (data as { data: T }).data
  }

  return data as T
}

interface HttpClient {
  get: <T = unknown>(url: string, options?: RequestOptions) => Promise<T>
  post: <T = unknown>(url: string, body: unknown, options?: RequestOptions) => Promise<T>
  put: <T = unknown>(url: string, body: unknown, options?: RequestOptions) => Promise<T>
  patch: <T = unknown>(url: string, body: unknown, options?: RequestOptions) => Promise<T>
  delete: <T = unknown>(url: string, options?: RequestOptions) => Promise<T>
  request: <T = unknown>(url: string, options?: RequestOptions) => Promise<T>
}

/**
 * HTTP Client with convenience methods
 */
export const httpClient: HttpClient = {
  /**
   * GET request
   */
  get: <T = unknown>(url: string, options: RequestOptions = {}) =>
    request<T>(url, { ...options, method: 'GET' }),

  /**
   * POST request
   */
  post: <T = unknown>(url: string, body: unknown, options: RequestOptions = {}) =>
    request<T>(url, { ...options, method: 'POST', body }),

  /**
   * PUT request
   */
  put: <T = unknown>(url: string, body: unknown, options: RequestOptions = {}) =>
    request<T>(url, { ...options, method: 'PUT', body }),

  /**
   * PATCH request
   */
  patch: <T = unknown>(url: string, body: unknown, options: RequestOptions = {}) =>
    request<T>(url, { ...options, method: 'PATCH', body }),

  /**
   * DELETE request
   */
  delete: <T = unknown>(url: string, options: RequestOptions = {}) =>
    request<T>(url, { ...options, method: 'DELETE' }),

  /**
   * Raw request with full control
   */
  request,
}

export default httpClient
