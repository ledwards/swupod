import { jsonParse } from './json'

export function parseDeckBuilderState(value: unknown): Record<string, unknown> {
  const parsed = jsonParse<unknown>(value, null)

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {}
  }

  return parsed as Record<string, unknown>
}
