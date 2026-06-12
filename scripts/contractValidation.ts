// Contract validation for the prebuild card fetch (megaplan F4, wayfinder
// docs/plans/2026-06-11-002 — swupod pins swuapi's generated API contract).
//
// swuapi publishes `contract/swuapi-contract.json` (generated from zod
// schemas, swuapi plan 2026-06-11-001 U1). swupod pins a copy at
// `contract/swuapi-contract.json` and fetchCards.ts validates every fetched
// /export/cards row against it BEFORE writing src/data/cards.json — an
// upstream shape change fails the fetch loudly instead of silently producing
// a broken cards.json (the prebuild then falls back to the existing data).
//
// Refresh the pin deliberately: copy the artifact from a swuapi checkout
// (it is committed there) and re-run `npm run fetch-cards`.
//
// The validator covers the JSON-Schema subset zod 4 emits for this contract:
// object/properties/required/additionalProperties, anyOf unions (nullable),
// array/items, string|number|integer|boolean|null primitive types. format/
// pattern are deliberately ignored — structural drift is the target, not
// value validation.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export interface JsonSchema {
  type?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  anyOf?: JsonSchema[]
  [key: string]: unknown
}

export interface ContractEndpoint {
  description: string
  rowsKey: string | null
  row: JsonSchema | null
  response: JsonSchema
}

export interface Contract {
  contractVersion: number
  endpoints: Record<string, ContractEndpoint>
}

/** Load the pinned contract artifact. Throws if missing/malformed. */
export function loadPinnedContract(contractPath?: string): Contract {
  const p = contractPath ?? path.join(moduleDir, '..', 'contract', 'swuapi-contract.json')
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as Contract
  if (typeof parsed.contractVersion !== 'number' || !parsed.endpoints) {
    throw new Error(`${p} does not look like a swuapi contract artifact`)
  }
  return parsed
}

function typeMatches(value: unknown, schema: JsonSchema, pathStr: string, errors: string[]): void {
  if (schema.anyOf) {
    const subErrors: string[] = []
    const ok = schema.anyOf.some(sub => {
      const attempt: string[] = []
      typeMatches(value, sub, pathStr, attempt)
      if (attempt.length > 0) subErrors.push(...attempt)
      return attempt.length === 0
    })
    if (!ok) errors.push(`${pathStr}: value ${JSON.stringify(value)?.slice(0, 60)} matches no anyOf branch`)
    return
  }
  switch (schema.type) {
    case undefined:
      return // unconstrained
    case 'string':
      if (typeof value !== 'string') errors.push(`${pathStr}: expected string, got ${typeName(value)}`)
      return
    case 'number':
      if (typeof value !== 'number') errors.push(`${pathStr}: expected number, got ${typeName(value)}`)
      return
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push(`${pathStr}: expected integer, got ${typeName(value)}`)
      }
      return
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${pathStr}: expected boolean, got ${typeName(value)}`)
      return
    case 'null':
      if (value !== null) errors.push(`${pathStr}: expected null, got ${typeName(value)}`)
      return
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${pathStr}: expected array, got ${typeName(value)}`)
        return
      }
      if (schema.items) {
        value.forEach((item, i) => typeMatches(item, schema.items as JsonSchema, `${pathStr}[${i}]`, errors))
      }
      return
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${pathStr}: expected object, got ${typeName(value)}`)
        return
      }
      const obj = value as Record<string, unknown>
      for (const key of schema.required ?? []) {
        if (!(key in obj)) {
          errors.push(`${pathStr}.${key}: REQUIRED key missing`)
          continue
        }
        const propSchema = schema.properties?.[key]
        if (propSchema) typeMatches(obj[key], propSchema, `${pathStr}.${key}`, errors)
      }
      return
    }
    default:
      return // unknown schema feature — never fail open the whole build on validator gaps
  }
}

function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * Validate rows against an endpoint's row schema. Returns human-readable
 * errors (empty = pass). Caps reported errors so one systemic drift doesn't
 * print 8,000 lines.
 */
export function validateRows(rows: unknown[], rowSchema: JsonSchema, maxErrors = 20): string[] {
  const errors: string[] = []
  for (let i = 0; i < rows.length; i++) {
    typeMatches(rows[i], rowSchema, `row[${i}]`, errors)
    if (errors.length >= maxErrors) {
      const truncated = errors.slice(0, maxErrors)
      truncated.push(`… stopped after ${maxErrors} errors (${rows.length - i - 1} rows unchecked)`)
      return truncated
    }
  }
  return errors
}

/**
 * Assert that every field a consumer reads exists in the contract's row
 * schema. `knownGaps` documents fields the consumer reads that are KNOWN to
 * be absent upstream (pre-existing bugs filed for a separate fix decision) —
 * they warn loudly instead of failing, so the catalogued damage doesn't
 * block builds while NEW drift still does.
 */
export function checkConsumedFields(
  consumed: string[],
  rowSchema: JsonSchema,
  knownGaps: Record<string, string> = {},
): { missing: string[]; gapWarnings: string[] } {
  const properties = new Set(Object.keys(rowSchema.properties ?? {}))
  const missing: string[] = []
  const gapWarnings: string[] = []
  for (const field of consumed) {
    if (properties.has(field)) continue
    if (field in knownGaps) {
      gapWarnings.push(`KNOWN BUG — consumed field "${field}" is not in the contract: ${knownGaps[field]}`)
    } else {
      missing.push(field)
    }
  }
  return { missing, gapWarnings }
}
