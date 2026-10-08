// @ts-nocheck
/**
 * JSON Utilities
 *
 * Safe JSON parsing utilities to replace the repeated pattern:
 * typeof x === 'string' ? JSON.parse(x) : x
 *
 * This pattern appears 170+ times in the codebase where data may come
 * from the database as a JSON string or already be parsed as an object.
 */

/**
 * Safely parse a value that may be a JSON string or already an object.
 * Handles the common pattern where database columns may return JSON strings
 * or already-parsed objects depending on the driver/context.
 *
 * @param value - The value to parse
 * @param fallback - Default value if parsing fails or value is nullish (default: null)
 * @returns Parsed object, original value if already an object, or fallback
 *
 * @example
 * // String JSON - parses it
 * jsonParse('{"foo": "bar"}') // => { foo: 'bar' }
 *
 * @example
 * // Already an object - returns as-is
 * jsonParse({ foo: 'bar' }) // => { foo: 'bar' }
 *
 * @example
 * // Null/undefined - returns fallback
 * jsonParse(null, {}) // => {}
 * jsonParse(undefined, []) // => []
 *
 * @example
 * // Invalid JSON - returns fallback
 * jsonParse('not valid json', { default: true }) // => { default: true }
 */
export function jsonParse<T = unknown>(value: string | T | null | undefined, fallback: T | null = null): T | null {
  // Handle nullish values
  if (value === null || value === undefined) {
    return fallback
  }

  // If it's a string, try to parse it
  if (typeof value === 'string') {
    // Empty string should return fallback
    if (value.trim() === '') {
      return fallback
    }

    try {
      return JSON.parse(value) as T
    } catch {
      // Invalid JSON - return fallback
      return fallback
    }
  }

  // Already an object/array - return as-is
  return value as T
}

/**
 * Safely stringify a value to JSON.
 * Handles values that may already be strings.
 *
 * @param value - The value to stringify
 * @param fallback - Default value if stringify fails (default: null)
 * @returns JSON string or fallback
 *
 * @example
 * jsonStringify({ foo: 'bar' }) // => '{"foo":"bar"}'
 * jsonStringify('already a string') // => 'already a string' (returned as-is)
 * jsonStringify(circularRef, '{}') // => '{}'
 */
export function jsonStringify(value: unknown, fallback: string | null = null): string | null {
  if (value === null || value === undefined) {
    return fallback
  }

  // If already a string, return as-is (assume it's already JSON)
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}
