/**
 * API pricing for eval-harness cost reporting. $/MTok.
 *
 * Models without a published rate here get a bounded estimate (Sonnet-class
 * to Opus-class) rather than a made-up number. Cache writes are priced at
 * the 5-minute rate; 1h-TTL writes cost 2x input instead of 1.25x, so treat
 * printed costs for 1h-cached pipelines as a slight underestimate.
 */
export interface UsageLike {
  apiCalls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

interface Rate {
  in: number
  out: number
  cacheRead: number
  cacheWrite5m: number
}

const RATES: Record<string, Rate | null> = {
  'claude-opus-4-7': { in: 15, out: 75, cacheRead: 1.5, cacheWrite5m: 18.75 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5, cacheRead: 0.1, cacheWrite5m: 1.25 },
  'claude-fable-5': null, // not published — bounded estimate
  'claude-sonnet-5': null, // not published — bounded estimate
}

const SONNET_CLASS: Rate = { in: 3, out: 15, cacheRead: 0.3, cacheWrite5m: 3.75 }
const OPUS_CLASS: Rate = { in: 15, out: 75, cacheRead: 1.5, cacheWrite5m: 18.75 }

function costAt(u: UsageLike, r: Rate): number {
  return (
    (u.inputTokens / 1e6) * r.in +
    (u.outputTokens / 1e6) * r.out +
    (u.cacheReadTokens / 1e6) * r.cacheRead +
    (u.cacheCreationTokens / 1e6) * r.cacheWrite5m
  )
}

/** One-line token summary, e.g. "calls=14 in=5.2K out=18.1K cacheR=210K cacheW=41K". */
export function fmtTokens(u: UsageLike): string {
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n))
  return `calls=${u.apiCalls} in=${k(u.inputTokens)} out=${k(u.outputTokens)} cacheR=${k(u.cacheReadTokens)} cacheW=${k(u.cacheCreationTokens)}`
}

/** One-line cost summary for a model, exact when the rate is known, bounded otherwise. */
export function fmtCost(model: string, u: UsageLike): string {
  const rate = RATES[model]
  if (rate) return `$${costAt(u, rate).toFixed(3)}`
  return `$${costAt(u, SONNET_CLASS).toFixed(3)}–$${costAt(u, OPUS_CLASS).toFixed(3)} (no published rate for ${model})`
}

export function sumUsage(list: Array<UsageLike | undefined>): UsageLike {
  const total: UsageLike = { apiCalls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  for (const u of list) {
    if (!u) continue
    total.apiCalls += u.apiCalls
    total.inputTokens += u.inputTokens
    total.outputTokens += u.outputTokens
    total.cacheReadTokens += u.cacheReadTokens
    total.cacheCreationTokens += u.cacheCreationTokens
  }
  return total
}
